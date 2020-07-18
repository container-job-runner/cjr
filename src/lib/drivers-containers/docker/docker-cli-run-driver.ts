// ===========================================================================
// Docker-Run-Driver: Controls Docker For Running containers
// ===========================================================================

import * as chalk from 'chalk'
import { label_strings, cli_name, Dictionary } from '../../constants'
import { ValidatedOutput } from '../../validated-output'
import { RunDriver, JobPortInfo, JobInfo, JobState, JobInfoFilter, NewJobInfo, jobFilter } from '../abstract/run-driver'
import { ShellCommand } from "../../shell-command"
import { DockerStackConfigObject, DockerStackPortConfig, DockerStackMountConfig, DockerStackResourceConfig } from '../../config/stacks/docker/docker-stack-configuration'
import { trim, parseLineJSON, trimTrailingNewline } from '../../functions/misc-functions'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'
import { ExecConfiguration } from '../../config/exec/exec-configuration'
import { SshShellCommand } from '../../remote/ssh-shell-command'

// internal types: used for creating jobs
export type DockerCreateOptions = DockerStackConfigObject & {
  "interactive": boolean
  "command": Array<string>
  "wd": string,
  "detached": boolean,
  "remove": boolean,
  "labels": { [key: string] : string}
}

export class DockerCliRunDriver extends RunDriver
{
  protected base_command = 'docker'
  protected selinux: boolean = false
  protected JSONOutputParser = parseLineJSON

  protected ERRORSTRINGS = {
    INVALID_JOB : chalk`{bold job_configuration is not of the proper type.}`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`,
    FAILED_CREATE_VOLUME: chalk`{bold Unable to create volume.}`
  }

  protected STATUSSTRING = {
    COPY : (container_id: string, container_path: string, host_path: string) =>
      chalk` copy {green ${container_id}:${container_path}}\n   to {green ${host_path}}`
  }

  constructor(shell: ShellCommand|SshShellCommand, options: {selinux: boolean})
  {
    super(shell)
    this.selinux = options.selinux || false
  }

  jobStart(job_configuration: DockerJobConfiguration, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>
  {
    const failure_output:ValidatedOutput<NewJobInfo> = new ValidatedOutput(false, {"id":"", "output": "", "exit-code": 1});
    if(!(job_configuration instanceof DockerJobConfiguration))
      return failure_output.pushError(this.ERRORSTRINGS.INVALID_JOB)
    const job_options = this.generateJobOptions(job_configuration)
    // add mandatory labels
    job_configuration.addLabel("runner", cli_name)
    // -- create container -----------------------------------------------------
    const create_output = this.create(
      job_configuration.stack_configuration.getImage(),
      this.extractCommand(job_configuration),
      job_options
    )
    if(!create_output.success) return failure_output
    const container_id = create_output.value;
    // -- run container --------------------------------------------------------
    const command = `${this.base_command} start`;
    const args: Array<string> = [container_id]
    const flags = (job_configuration.synchronous) ? {attach: {}, interactive: {}} : {}
    const shell_options = (stdio === "pipe") ? {stdio: "pipe"} : {stdio: "inherit"}
    const shell_output = this.shell.exec(command, flags, args, shell_options)

    return new ValidatedOutput(true, {
      "id": container_id,
      "output": ShellCommand.stdout(shell_output.value),
      "exit-code": ShellCommand.status(shell_output.value)
    })
  }

  protected generateJobOptions(job_configuration: DockerJobConfiguration) : DockerCreateOptions
  {
    return {
      ... job_configuration.stack_configuration.config,
      ... {
        "interactive": true,
        "command": job_configuration.command,
        "wd": job_configuration.working_directory,
        "detached": !job_configuration.synchronous,
        "remove": job_configuration.remove_on_exit,
        "labels": job_configuration.labels
      }
    }
  }

  protected extractCommand(job_configuration: DockerJobConfiguration) : Array<string>
  {
    const command = job_configuration.command;
    const entrypoint = job_configuration.stack_configuration.getEntrypoint()

    if(!entrypoint)
      return command
    else // if entrypoint exists prepend command with all but first entry which will be added to --entrypoint flag
      return entrypoint.splice(1).concat(command)
  }

  protected create(image_name: string, command: Array<string>, run_options:DockerCreateOptions) : ValidatedOutput<string>
  {
    const cmd = `${this.base_command} create`;
    const args  = [image_name].concat(command)
    const flags = this.runFlags(run_options)
    const result = trim(this.shell.output(cmd, flags, args, {}))
    if(result.value === "") result.pushError(this.ERRORSTRINGS.EMPTY_CREATE_ID)
    return result
  }

  jobLog(id: string, lines: string="all") : ValidatedOutput<string>
  {
    const command = `${this.base_command} logs`;
    const args = [id]
    const lines_int = parseInt(lines)
    const flags = (isNaN(lines_int)) ? {} : {tail: `${lines_int}`}
    return trimTrailingNewline(this.shell.output(command, flags, args))
  }

  jobAttach(id: string) : ValidatedOutput<undefined>
  {
    const command = `${this.base_command} attach`;
    const args = [id]
    const flags = {}
    return new ValidatedOutput(true, undefined)
      .absorb(this.shell.exec(command, flags, args))
  }

  jobExec(id: string, configuration: ExecConfiguration, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>
  {
    const command = `${this.base_command} exec`
      const flags = ShellCommand.removeEmptyFlags({
        'w': configuration.working_directory,
        'd': (configuration.synchronous) ? undefined : {},
        't': {},
        'i': (stdio === "pipe") ? undefined : {} // only enable interactive flag if stdio is inherited. The node shell with stdio='pipe' is not tty and the error 'the input device is not TTY' will cause problems for programs that use TTY since -t flag is active
      })
    const args = [id].concat(configuration.command)
    const shell_options = (stdio === "pipe") ? {stdio: "pipe"} : {stdio: "inherit"}
    const result = this.shell.exec(command, flags, args, shell_options)

    return new ValidatedOutput(true, {
      "id": "", // no idea for docker cli exec
      "output": ShellCommand.stdout(result.value),
      "exit-code": ShellCommand.status(result.value)
    })
  }

  jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined).absorb(this.stop(ids)).absorb(this.remove(ids))
  }

  jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined).absorb(this.stop(ids))
  }

  volumeDelete(ids: Array<string>) : ValidatedOutput<undefined>
  {
    if(ids.length == 0) return new ValidatedOutput(true, undefined);
    const command = `${this.base_command} volume rm`
    return new ValidatedOutput(true, undefined).absorb(
      this.shell.exec(command, {}, ids, {stdio: "pipe"})
    )
  }

  // protected helpers

  protected stop(ids: Array<string>)
  {
    if(ids.length == 0) return new ValidatedOutput(true, undefined);
    const command = `${this.base_command} stop`;
    const args = ids
    const flags = {}
    return this.shell.exec(command, flags, args, {stdio: "pipe"})
  }

  protected remove(ids: Array<string>)
  {
    if(ids.length == 0) return new ValidatedOutput(true, undefined);
    const command = `${this.base_command} rm`;
    const args = ids
    const flags = {}
    return this.shell.exec(command, flags, args, {stdio: "pipe"})
  }

  //JOBINFO returns information about running jobs that match a given stack_path AND running state.
  // PARAMETERS
  // stack_paths: Array<string> - any jobs with this stack will be returned. if stack_paths=[] or stack_paths=[""]
  //                              then jobs with any stack will be returned.
  // job_states: Array<string> - the state of returned jobs will match with any of the values specified in this array. If
  //                             job_states=[] or job_states=[""] then jobs with any state will be returned.
  jobInfo(filter?: JobInfoFilter) : ValidatedOutput<Array<JobInfo>>
  {
      // -- extract job info using docker ps -----------------------------------
      const ps_result = this.psToJobInfo()
      if(!ps_result.success)
        return new ValidatedOutput(false, [])
      const jobs = jobFilter(ps_result.value, this.psFilter(filter))
      // -- extract remaining job info using docker inspect --------------------
      const inspect_result = this.addInspectData(jobs)
      if(!inspect_result.success)
        return new ValidatedOutput(false, [])
      // -- return filtered list of jobs ---------------------------------------
      return new ValidatedOutput(true, jobFilter(jobs, filter))
  }

  protected ps() : ValidatedOutput<Array<Dictionary>>
  {
    const command = `${this.base_command} ps`;
    const args: Array<string> = []
    const flags: Dictionary = {
      "a" : {},
      "no-trunc": {},
      "filter": [`label=runner=${cli_name}`]
    };
    this.addJSONFormatFlag(flags)
    const ps_output = this.JSONOutputParser(this.shell.output(command, flags, args, {}))
    if(!ps_output.success) return new ValidatedOutput(false, [])
    return ps_output
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
        command: x.Command, // this field is overwritten using inspect data, since docker ps command also shows entrypoint
        state: this.psStatusToJobInfoState(x.Status),
        status: x.Status,
        stack: "",  // info for this field is not provided from docker ps
        labels: {}, // info for this field is not provided from docker ps
        ports: []   // info for this field is not provided from docker ps
      }
    })
    return new ValidatedOutput(true, jobs)
  }

  // converts statusMessage to one of three states
  protected psStatusToJobInfoState(x: String) : JobState
  {
    if(x.match(/^Exited/)) return "exited"
    if(x.match(/^Created/)) return "created"
    if(x.match(/^Up/)) return "running"
    return "unknown"
  }

  // filters that can be immediately applied after running ps
  protected psFilter(filter?: JobInfoFilter) : JobInfoFilter|undefined
  {
    if(!(filter?.ids || filter?.states))
      return undefined
    return {
      "ids": filter?.ids,
      "states": filter?.states
    }
  }

  // fills in jobInfo data that can be only accessed by docker inspect
  protected addInspectData(jobs: Array<JobInfo>) : ValidatedOutput<Array<JobInfo>>
  {
    if(jobs.length == 0)
      return new ValidatedOutput(true, jobs)

    const ids = jobs.map((x:JobInfo) => x.id)
    const result = this.JSONOutputParser(this.shell.output(
      `${this.base_command} inspect`,
      {format: '{{"{\\\"ID\\\":"}}{{json .Id}},{{"\\\"PortBindings\\\":"}}{{json .HostConfig.PortBindings}},{{"\\\"Labels\\\":"}}{{json .Config.Labels}},{{"\\\"Command\\\":"}}{{json .Config.Cmd}}{{"}"}}'}, // JSON format {ID: XXX, Labels: YYY, PortBindings: ZZZ, Command: UUU}
      ids,
      {})
    )
    if(!result.success)
      return new ValidatedOutput(false, jobs)

    // -- extract label & port data and index by id ---------------------------
    const inspect_data:Dictionary = {}
    result.value.map((info:Dictionary) => {
      if(info.ID)
        inspect_data[info.ID] = {
          'Labels': info?.['Labels'] || {},
          'Ports': this.PortBindingsToJobPortInfo(info?.['PortBindings'] || {}),
          'Command': info?.['Command'].join(" ") || ""
        }
    });

    // add data to job array
    jobs.map( (job:JobInfo):void => {
      const id = job.id
      if(inspect_data[id] !== undefined) {
        job.stack  = inspect_data[id]?.Labels?.[label_strings.job["stack-path"]] || "",
        job.labels = inspect_data[id]?.Labels || {}
        job.ports = inspect_data[id]?.Ports || []
        job.command = inspect_data[id]?.Command || job.command
      }
    })
    return new ValidatedOutput(true, jobs)
  }

  // -- function for extracting port information from docker inspect PortBindings object -----------------
  // Assumes PortBindings is of the form {"PORT/tcp"|"PORT/udp": [{HostPort: string, HostIp: String}], "PORTKEY": [{hostPort: "NUMBER"}]}
  protected PortBindingsToJobPortInfo(PortBindings:Dictionary) : Array<JobPortInfo>
  {
    const port_info: Array<JobPortInfo> = [];
    Object.keys(PortBindings).map((k:string) => { // key is of the form "PORT/tcp"|"PORT/udp
      const container_port = parseInt(/^\d*/.exec(k)?.pop() || "");
      const host_port = parseInt(PortBindings[k]?.[0]?.HostPort || "");
      const host_ip = PortBindings[k]?.[0]?.HostIp || "";
      if(!isNaN(container_port) && !isNaN(host_port))
        port_info.push({hostPort: host_port, containerPort: container_port, hostIp: host_ip})
    })
    return port_info
  }

  jobToImage(id: string, image_name: string) : ValidatedOutput<string>
  {
    const command = `${this.base_command} commit`
    const args  = [id, image_name]
    const flags = {}
    return trim(this.shell.output(command, flags, args))
  }

  // options accepts following properties {lables?: Array<string>, driver?: string, name?:string}
  volumeCreate(options?:Dictionary) : ValidatedOutput<string>
  {
    const command = `${this.base_command} volume create`
    var flags:Dictionary = {}
    if(options?.labels?.length > 0) flags.labels = options?.labels
    if(options?.driver) flags.driver = options?.driver
    const args = (options?.name) ? [options.name] : []
    return trim(this.shell.output(command, flags, args, {}))
  }

  protected runFlags(run_object: DockerCreateOptions) // TODO: CONSOLIDATE ALL FUNCTIONS THAT DID NOT REQUIRE OVERLOADING
  {
    var flags:Dictionary = {};
    this.addEntrypointFlags(flags, run_object)
    this.addRemovalFlags(flags, run_object)
    this.addInteractiveFlags(flags, run_object)
    this.addWorkingDirFlags(flags, run_object)
    this.addPortFlags(flags, run_object)
    this.addENVFlags(flags, run_object)
    this.addMountFlags(flags, run_object)
    this.addResourceFlags(flags, run_object)
    this.addLabelFlags(flags, run_object)
    this.addSpecialFlags(flags, run_object)
    return flags
  }

  // === START protected Helper Functions for flag generation ====================

  protected addJSONFormatFlag(flags: Dictionary)
  {
    flags["format"] = '{{json .}}'
  }

  protected addRemovalFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.remove) {
      flags["rm"] = {}
    }
  }

  protected addInteractiveFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.interactive == true)
    {
        flags["i"] = {}
        flags["t"] = {}
    }
  }

  protected addWorkingDirFlags(flags:Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.wd)
    {
      flags["w"] = run_object.wd
    }
  }

  protected addPortFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.ports && run_object?.ports?.length > 0)
    {
      flags["p"] = {
        value: run_object.ports.map((po:DockerStackPortConfig) => `${(po.hostIp) ? `${po.hostIp}:` : ""}${po.hostPort}:${po.containerPort}`)
      }
    }
  }

  protected addENVFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.environment)
    {
      const keys = Object.keys(run_object.environment)
      flags["env"] = {
        value: keys.map(key => `${key}=${run_object.environment?.[key] || ""}`)
      }
    }
  }

  protected addResourceFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    const valid_keys:Array<keyof DockerStackResourceConfig> = ["cpus", "gpu", "memory", "memory-swap"]
    valid_keys?.map((key:keyof DockerStackResourceConfig) => {
      if(run_object?.resources?.[key]) flags[key] = run_object.resources[key]
    })
  }

  protected addEntrypointFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.entrypoint?.[0])
    {
      flags["entrypoint"] = run_object['entrypoint'][0]
    }
  }

  protected addSpecialFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.flags?.network) { // used for sharing DISPLAY variable
      flags["network"] = run_object.flags.network
    }
    if(run_object?.flags?.['mac-address'])
    {
      flags["mac-address"] = run_object?.flags?.['mac-address']
    }
  }

  protected addMountFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.mounts && run_object?.mounts?.length > 0)
    {
      // -- standard mounts use --mount flag -----------------------------------
      const standard_mounts = (this.selinux) ?
        run_object.mounts.filter( (mount:DockerStackMountConfig) => ((mount.type != "bind") || (mount.type == "bind" && mount?.selinux === false)) ) :
        run_object.mounts.filter( (mount:DockerStackMountConfig) => ((mount.type != "bind") || (mount.type == "bind" && mount?.selinux !== true)) ) ;
      if (standard_mounts.length > 0)
        flags["mount"] = {
          escape: false,
          value: standard_mounts.map(this.mountObjectToFlagStr)
        }
      // -- selinux mounts require --volume flag -------------------------------
      const selinux_mounts  = (this.selinux) ?
        run_object.mounts.filter( (mount:DockerStackMountConfig) => (mount.type == "bind" && mount?.selinux !== false) ) :
        run_object.mounts.filter( (mount:DockerStackMountConfig) => (mount.type == "bind" && mount?.selinux === true)  ) ;
      if(selinux_mounts.length > 0)
        flags["volume"] = {
          escape: false,
          value: selinux_mounts.map(this.selinuxBindMountObjectToFlagStr)
        }
    }
  }

  protected mountObjectToFlagStr(mo: DockerStackMountConfig)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.hostPath || "")},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""},consistency=${mo.consistency || "consistent"}`
      case "volume":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.volumeName || "")},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${ShellCommand.bashEscape(mo.containerPath)}`
    }
  }

  protected selinuxBindMountObjectToFlagStr(mo: DockerStackMountConfig)
  {
    if(mo.type !== "bind" || !mo.hostPath) return []
    const selinux_str = 'z' // allow sharing with all containers
    return `${ShellCommand.bashEscape(mo.hostPath)}:${ShellCommand.bashEscape(mo.containerPath)}:${selinux_str}${(mo.readonly) ? ",readonly" : ""},consistency=${mo.consistency || "consistent"}`
  }

  protected addLabelFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.labels) {
      const keys = Object.keys(run_object.labels)
      flags["label"] = keys.map(k => `${k}=${run_object.labels[k]}`)
    }
  }

}
