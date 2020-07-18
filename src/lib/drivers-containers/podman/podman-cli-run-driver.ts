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
        id: x.ID,
        image: x.Image,
        names: x.Names,
        command: x.Command, // this field is overwritten using inspect data, since podman ps command also shows entrypoint
        state: this.psStatusToJobInfoState(x.Status),
        stack: x?.Labels?.[label_strings.job["stack-path"]] || "",
        labels: x?.Labels || {},
        ports: [], // info for this field is not provided from podman ps
        status: x.Status
      }
    })
    return new ValidatedOutput(true, jobs)
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
      this.shell.output(`${this.base_command} inspect`, {format: '{{"{\\\"ID\\\":"}}{{json .ID}},{{"\\\"PortBindings\\\":"}}{{json .HostConfig.PortBindings}},{{"\\\"Command\\\":"}}{{json .Config.Cmd}}{{"}"}}'}, ids, {})
    )
    if(!result.success) return new ValidatedOutput(false, [])

    // -- extract port data and index by id ------------------------------------
    const inspect_data:Dictionary = {}
      result.value.map((info:Dictionary) => {
        if(info.ID)
            inspect_data[info.ID] = {
            'Ports': this.PortBindingsToJobPortInfo(info?.['PortBindings'] || {}),
            'Command': info?.['Command'].join(" ") || ""
            }
    });

    // -- add data to job array ------------------------------------------------
    jobs.map( (job:JobInfo):void => {
      const id = job.id
      if(inspect_data[id] !== undefined) {
        job.ports = inspect_data[id]?.Ports || []
        job.command = inspect_data[id]?.Command || job.command
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
    if(run_object?.flags?.['mac-address'])
    {
      flags["mac-address"] = run_object?.flags?.['mac-address']
    }
    if(run_object?.flags?.['network'])
    {
      flags["network"] = run_object?.flags?.['network']
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
