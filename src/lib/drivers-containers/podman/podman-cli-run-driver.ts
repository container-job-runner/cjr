// ===========================================================================
// Podman-Run-Driver: Controls Podman For Running containers
// ===========================================================================

import { ShellCommand } from "../../shell-command"
import { JobInfo, JobInfoFilter, JobState } from '../abstract/run-driver'
import { DockerCliRunDriver, DockerCreateOptions }  from '../docker/docker-cli-run-driver'
import { parseJSON, parseLineJSON } from '../../functions/misc-functions'
import { ValidatedOutput } from '../../validated-output'
import { label_strings, Dictionary } from '../../constants'
import { DockerStackMountConfig, DockerStackResourceConfig } from '../../config/stacks/docker/docker-stack-configuration'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'

export class PodmanCliRunDriver extends DockerCliRunDriver
{
  protected base_command = 'podman'
  protected JSONOutputParser = parseJSON
  enable_unshare = false

  protected extractCommand(job_configuration: DockerJobConfiguration) : Array<string>
  {
    return job_configuration.command;
  }

  protected addJSONFormatFlag(flags: Dictionary)
  {
    flags["format"] = 'json'
  }

  // converts data from docker ps into a JobObject
  protected psToJobInfo() : ValidatedOutput<Array<JobInfo>>
  {
    const ps_result = this.ps()
    if(!ps_result.success)
      return new ValidatedOutput(false, [])

    const jobs:Array<JobInfo> = ps_result.value.map( (x:Dictionary) : JobInfo => {
      return {
        id: x.ID || x.Id, // Note: podman > 2.0 has field x.Id, podman < 2.0 has field x.ID
        image: x.Image,
        names: x.Names,
        command: (Array.isArray(x.Command)) ? x.Command.join(" ") : x.Command, // NOTE: podman > 2.0 x.Command is an array, podman < 2.0 x.Command is a string. This field is overwritten using inspect data, since podman ps command also shows entrypoint.
        state: this.psStatusToJobInfoState(x.Status || x.State),
        stack: x?.Labels?.[label_strings.job["stack-path"]] || "",
        labels: x?.Labels || {},
        ports: [], // info for this field is not provided from podman ps
        status: x.Status || x.State // podman 2.0 does not have status field, use Status for now?
      }
    })
    return new ValidatedOutput(true, jobs)
  }

  protected psStatusToJobInfoState(x: String) : JobState
  {
    const state = super.psStatusToJobInfoState(x) // used for podman < 2.0 (which prints Status field like docker)
    if(state != "unknown") return state
    // this code is for podman >= 2.0
    if(x.match(/^exited/)) return "exited"
    if(x.match(/^created/)) return "created"
    if(x.match(/^running/)) return "running"
    return "unknown"
  }

  // filters that can be immediately applied after running ps
  protected psFilter(filter?: JobInfoFilter) : JobInfoFilter|undefined
  {
    return filter
  }

  // fills in jobInfo data that can be only accessed by docker inspect
  protected addInspectData(jobs: Array<JobInfo>) : ValidatedOutput<Array<JobInfo>>
  {
    if(jobs.length == 0)
      return new ValidatedOutput(true, jobs)

    const ids = jobs.map((x:JobInfo) => x.id)
    const result = parseLineJSON(
      this.shell.output(`${this.base_command} inspect`, {format: '{{"{\\\"ID\\\":"}}{{json .ID}},{{"\\\"PortBindings\\\":"}}{{json .HostConfig.PortBindings}}{{"}"}}'}, ids, {})
    )
    if(!result.success) return new ValidatedOutput(false, [])

    // -- extract port data and index by id ------------------------------------
    const inspect_data:Dictionary = {}
      result.value.map((info:Dictionary) => {
        if(info.ID)
            inspect_data[info.ID] = {
            'Ports': this.PortBindingsToJobPortInfo(info?.['PortBindings'] || {})
            }
    });

    // -- add data to job array ------------------------------------------------
    jobs.map( (job:JobInfo):void => {
      const id = job.id
      if(inspect_data[id] !== undefined) {
        job.ports = inspect_data[id]?.Ports || []
      }
    })
    return new ValidatedOutput(true, jobs)
  }
  protected addResourceFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    const valid_keys:Array<keyof DockerStackResourceConfig> = ["cpus", "gpu", "memory"] // podman does not support memory-swap
    valid_keys?.map((key:keyof DockerStackResourceConfig) => {
      if(run_object?.resources?.[key]) flags[key] = run_object.resources[key]
    })
  }

  protected create(image_name: string, command: Array<string>, run_options:DockerCreateOptions) : ValidatedOutput<string>
  {
    // add support for podman unshare command for binds
    const unshare_result = new ValidatedOutput(true, "")
    const unshare_id_arg = run_options?.flags?.['podman-chown-binds'];

    // only call unshare if enable_unshare is set to true, and unshare_id_arg is of the form uid:gid
    if(this.enable_unshare && unshare_id_arg && /\d+:\d+/.test(unshare_id_arg)) {
        const bind_mounts = run_options.mounts?.filter((mount:DockerStackMountConfig) => mount.type === "bind") || [];
        bind_mounts.map( (mount:DockerStackMountConfig) => {
            if(mount.hostPath) 
                unshare_result.absorb(
                    this.shell.output(`${this.base_command} unshare chown`, {R: {}}, [unshare_id_arg, mount.hostPath])
                )
        })
        if(!unshare_result.success)
            return unshare_result
    }

    return super.create(image_name, command, run_options)
  }

  protected mountObjectToFlagStr(mo: DockerStackMountConfig)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.hostPath || "")},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""}`
      case "volume":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.volumeName || "")},destination=${ShellCommand.bashEscape(mo.containerPath)},exec${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${ShellCommand.bashEscape(mo.containerPath)}`
    }
  }

  protected selinuxBindMountObjectToFlagStr(mo: DockerStackMountConfig)
  {
    if(mo.type !== "bind" || !mo.hostPath) return []
    const selinux_str = 'z' // allow sharing with all containers
    return `${ShellCommand.bashEscape(mo.hostPath)}:${ShellCommand.bashEscape(mo.containerPath)}:${selinux_str}${(mo.readonly) ? ",readonly" : ""}`
  }

  protected addSpecialFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    super.addSpecialFlags(flags, run_object)
    if(run_object?.flags?.userns) { // used for consistant file permissions
      flags["userns"] = run_object.flags.userns
    }
    if(run_object?.flags?.["security-opt"]) { // used for binding X11 directory
      flags["security-opt"] = run_object.flags["security-opt"]
    }
    return flags
  }

  protected addEntrypointFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.entrypoint)
    {
      flags["entrypoint"] = JSON.stringify(run_object['entrypoint'])
    }
  }

}
