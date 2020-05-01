// ===========================================================================
// Docker-Run-Driver: Controls Docker For Running containers
// ===========================================================================

import * as path from 'path'
import * as chalk from 'chalk'
import { cli_name, stack_path_label, name_label, Dictionary } from '../../constants'
import { ValidatedOutput } from '../../validated-output'
import { PathTools } from '../../fileio/path-tools'
import { RunDriver, JobState, JobPortInfo, JobInfo, JobInfoFilter, NewJobInfo } from '../abstract/run-driver'
import { ShellCommand } from "../../shell-command"
import { dr_vo_validator } from './schema/docker-run-schema'
import { de_vo_validator } from './schema/docker-exec-schema'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { trim, parseJSON, parseLineJSON, trimTrailingNewline } from '../../functions/misc-functions'
import { SshShellCommand } from '../../remote/ssh-shell-command'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'
import { ExecConstrutorOptions, ExecConfiguration } from '../../config/exec/exec-configuration'

export class DockerRunDriver extends RunDriver
{
  protected base_command = 'docker'
  protected selinux: boolean = false
  protected run_schema_validator = dr_vo_validator
  protected exec_schema_validator = de_vo_validator
  protected outputParser = parseLineJSON

  protected ERRORSTRINGS = {
    INVALID_JOB : chalk`{bold job_options object did not pass validation.}`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`,
    FAILED_CREATE_VOLUME: chalk`{bold Unable to create volume.}`
  }

  protected STATUSSTRING = {
    COPY : (container_id: string, container_path: string, host_path: string) =>
      chalk` copy {green ${container_id}:${container_path}}\n   to {green ${host_path}}`
  }

  constructor(shell: ShellCommand, options: {tag: string, selinux: boolean})
  {
    super(shell, options.tag)
    this.selinux = options.selinux || false
  }

  emptyStackConfiguration()
  {
    return new DockerStackConfiguration()
  }

  emptyJobConfiguration(stack_configuration?: DockerStackConfiguration)
  {
    return new DockerJobConfiguration(stack_configuration || this.emptyStackConfiguration())
  }

  emptyExecConfiguration(options?:ExecConstrutorOptions)
  {
    return new ExecConfiguration(options)
  }

  jobStart(job_configuration: DockerJobConfiguration, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>
  {
    const failure_output:ValidatedOutput<NewJobInfo> = new ValidatedOutput(false, {"id":"", "output": "", "exit-code": 1});
    const job_options = job_configuration.cliContainerCreateObject()
    // add mandatory labels
    job_configuration.addLabel("runner", cli_name)
    if(!this.run_schema_validator(job_options).success)
      return failure_output.pushError(this.ERRORSTRINGS.INVALID_JOB)
    // -- create container -----------------------------------------------------
    const create_output = this.create(
      job_configuration.stack_configuration.getImage(),
      job_configuration.command,
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

  protected create(image_name: string, command: Array<string>, run_options={}) : ValidatedOutput<string>
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
      const command = `${this.base_command} ps`;
      const args: Array<string> = []
      const flags: Dictionary = {
        "a" : {},
        "no-trunc": {},
        "filter": [`label=runner=${cli_name}`]
      };
      this.addFormatFlags(flags, {format: "json"})
      const ps_output = this.outputParser(this.shell.output(command, flags, args, {}))
      if(!ps_output.success) return new ValidatedOutput(false, [])

      const info_request = this.extractJobInfo(ps_output.value)
      if(!info_request.success) return new ValidatedOutput(false, [])
      return new ValidatedOutput(true, this.jobFilter(info_request.value, filter))
  }

  protected extractJobInfo(raw_ps_data: Array<Dictionary>) : ValidatedOutput<Array<JobInfo>>
  {
    // NOTE: docker ps does not correctly format labels with --format {{json .}}
    // This Function calls docker inspect to extract properly formatted labels
    if(raw_ps_data.length == 0)
      return new ValidatedOutput(true, [])

    const ids = raw_ps_data.map((x:Dictionary) => x.ID)
    const result = this.outputParser(this.shell.output(
      `${this.base_command} inspect`,
      {format: '{{"{\\\"ID\\\":"}}{{json .Id}},{{"\\\"PortBindings\\\":"}}{{json .HostConfig.PortBindings}},{{"\\\"Labels\\\":"}}{{json .Config.Labels}}{{"}"}}'}, // JSON format {ID: XXX, Labels: YYY, PortBindings: ZZZ}
      ids,
      {})
    )
    if(!result.success) return new ValidatedOutput(false, [])
    // -- function for extracting port information for inspect
    const extractBoundPorts = (PortBindings:Dictionary) => { // entries are of the form {"PORT/tcp"|"PORT/udp": [{HostPort: string, HostIp: String}], "PORTKEY": [{hostPort: "NUMBER"}]}
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
    // -- extract label & port data -----------------------------------------------
    const inspect_data:Dictionary = {}
    result.value.map((info:Dictionary) => {
      if(info.ID)
        inspect_data[info.ID] = {
          'Labels': info?.['Labels'] || {},
          'Ports': extractBoundPorts(info?.['PortBindings'] || {})
        }
    });

    // converts statusMessage to one of three states
    const state = (x: String) => {
      if(x.match(/^Exited/)) return "exited"
      if(x.match(/^Created/)) return "created"
      if(x.match(/^Up/)) return "running"
      return "unknown"
    }

    return new ValidatedOutput(
      true,
      raw_ps_data.map((x:Dictionary) => {
        return {
          id: x.ID,
          names: x.Names,
          command: x.Command,
          state: state(x.Status),
          stack: inspect_data?.[x.ID]?.Labels?.[stack_path_label] || "",
          labels: inspect_data?.[x.ID]?.Labels || {},
          ports: inspect_data?.[x.ID]?.Ports || [],
          status: x.Status
        }
      })
    )
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

  imageName(stack_path: string, prefix: string="")
  {
    return super.imageName(stack_path, prefix).toLowerCase() // Docker only accepts lowercase image names
  }

  protected runFlags(run_object: Dictionary) // TODO: CONSOLIDATE ALL FUNCTIONS THAT DID NOT REQUIRE OVERLOADING
  {
    var flags = {};
    if(this.run_schema_validator(run_object).success) //verify docker-run schema
    {
      this.addEntrypointFlags(flags, run_object)
      this.addFormatFlags(flags, run_object)
      this.addRemovalFlags(flags, run_object)
      this.addInteractiveFlags(flags, run_object)
      this.addWorkingDirFlags(flags, run_object)
      this.addNameFlags(flags, run_object)
      this.addPortFlags(flags, run_object)
      this.addENVFlags(flags, run_object)
      this.addMountFlags(flags, run_object)
      this.addResourceFlags(flags, run_object)
      this.addLabelFlags(flags, run_object)
      this.addSpecialFlags(flags, run_object)
    }
    return flags
  }

  // === START protected Helper Functions for flag generation ====================

  protected addFormatFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.format === "json") {
      flags["format"] = '{{json .}}'
    }
  }

  protected addRemovalFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.remove) {
      flags["rm"] = {}
    }
  }

  protected addInteractiveFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.interactive == true)
    {
        flags["i"] = {}
        flags["t"] = {}
    }
  }

  protected addWorkingDirFlags(flags:Dictionary, run_object: Dictionary)
  {
    if(run_object?.wd)
    {
      flags["w"] = run_object.wd
    }
  }

  protected addNameFlags(flags:Dictionary, run_object: Dictionary)
  {
    if(run_object?.name)
    {
      flags["name"] = run_object.name
    }
  }

  protected addPortFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.ports?.length > 0)
    {
      flags["p"] = {
        escape: false,
        value: run_object.ports.map((po:Dictionary) => `${(po.address) ? `${po.address}:` : ""}${po.hostPort}:${po.containerPort}`)
      }
    }
  }

  protected addENVFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.environment)
    {
      const keys = Object.keys(run_object.environment)
      flags["env"] = {
        escape: false,
        value: keys.map(key => `${key}=${run_object.environment[key]}`)
      }
    }
  }

  protected addResourceFlags(flags: Dictionary, run_object: Dictionary)
  {
    const valid_keys = ["cpus", "gpu", "memory", "swap-memory"]
    const keys = Object.keys(run_object?.resources || {})
    keys?.map((key:string) => {
      if(valid_keys.includes(key)) flags[key] = run_object?.resources[key]
    })
  }

  protected addEntrypointFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.entrypoint)
    {
      flags["entrypoint"] = run_object['entrypoint']
    }
  }

  protected addSpecialFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.flags?.network) { // used for sharing DISPLAY variable
      flags["network"] = run_object.flags.network
    }
    if(run_object?.flags?.['mac-address'])
    {
      flags["mac-address"] = run_object?.flags?.['mac-address']
    }
  }

  protected addMountFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.mounts?.length > 0)
    {
      // -- standard mounts use --mount flag -----------------------------------
      const standard_mounts = (this.selinux) ?
        run_object.mounts.filter( (mount:Dictionary) => ((mount.type != "bind") || (mount.type == "bind" && mount?.selinux === false)) ) :
        run_object.mounts.filter( (mount:Dictionary) => ((mount.type != "bind") || (mount.type == "bind" && mount?.selinux !== true)) ) ;
      if (standard_mounts.length > 0)
        flags["mount"] = {
          escape: false,
          value: standard_mounts.map(this.mountObjectToFlagStr)
        }
      // -- selinux mounts require --volume flag -------------------------------
      const selinux_mounts  = (this.selinux) ?
        run_object.mounts.filter( (mount:Dictionary) => (mount.type == "bind" && mount?.selinux !== false) ) :
        run_object.mounts.filter( (mount:Dictionary) => (mount.type == "bind" && mount?.selinux === true)  ) ;
      if(selinux_mounts.length > 0)
        flags["volume"] = {
          escape: false,
          value: selinux_mounts.map(this.selinuxBindMountObjectToFlagStr)
        }
    }
  }

  protected mountObjectToFlagStr(mo: Dictionary)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.hostPath)},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""},consistency=${mo.consistency || "consistent"}`
      case "volume":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.volumeName)},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${ShellCommand.bashEscape(mo.containerPath)}`
    }
  }

  protected selinuxBindMountObjectToFlagStr(mo: Dictionary)
  {
    if(mo.type !== "bind") return []
    const selinux_str = 'z' // allow sharing with all containers
    return `${ShellCommand.bashEscape(mo.hostPath)}:${ShellCommand.bashEscape(mo.containerPath)}:${selinux_str}${(mo.readonly) ? ",readonly" : ""},consistency=${mo.consistency || "consistent"}`
  }

  protected addLabelFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.labels) {
      const keys = Object.keys(run_object.labels)
      flags["label"] = keys.map(k => `${k}=${run_object.labels[k]}`)
    }
  }

}
