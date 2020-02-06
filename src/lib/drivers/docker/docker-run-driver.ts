// ===========================================================================
// Docker-Run-Driver: Controls Docker For Running containers
// ===========================================================================

import * as path from 'path'
import * as chalk from 'chalk'
import {cli_name} from '../../constants'
import {ValidatedOutput} from '../../validated-output'
import {PathTools} from '../../fileio/path-tools'
import {RunDriver, Dictionary} from '../abstract/run-driver'
import {ShellCommand} from "../../shell-command"
import {dr_ajv_validator} from './schema/docker-run-schema'
import {de_ajv_validator} from './schema/docker-exec-schema'
import {dj_vo_validator} from './schema/docker-job-schema'
import {djc_vo_validator} from './schema/docker-job-copy-schema'
import {ajvValidatorToValidatedOutput} from '../../functions/misc-functions'


export class DockerRunDriver extends RunDriver
{
  protected base_command = 'docker'
  protected sub_commands = {
    run: "run",
    list: "ps",
    stop: "stop",
    attach: "attach",
    log: "logs",
    remove: "rm",
    create: "create",
    copy: "cp",
    start: "start",
    exec: "exec",
    commit: "commit"
  }
  protected json_output_format = "line_json"
  protected job_schema_validator  = dj_vo_validator
  protected job_copy_validator    = djc_vo_validator
  protected exec_schema_validator = de_ajv_validator
  protected run_schema_validator  = dr_ajv_validator

  protected ERRORSTRINGS = {
    INVALID_JOB : chalk`{bold job_options object did not pass validation.}`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`
  }

  // job functions

  jobStart(stack_path: string, job_options: Dictionary, run_options: Dictionary={}){

    var result = this.job_schema_validator(job_options)
    if(!result.success) {
      result.pushError(this.ERRORSTRINGS.INVALID_JOB)
      return result
    }

    // copy variables for convience
    const hostRoot = job_options?.hostRoot
    const containerRoot = job_options?.containerRoot
    const command_str = job_options.command
    // force job to be interactive so that we can attach to it
    run_options["interactive"] = true;
    run_options["remove"] = job_options["removeOnExit"]
    if(job_options?.name) run_options["name"] = job_options["name"]
    // add mandatory labels
    const job_labels = {runner: cli_name, stack: this.stackName(stack_path)}
    run_options["labels"] = { ...(run_options["labels"] || {}), ...job_labels}

    result = this.create(stack_path, command_str, run_options)
    if(!result.success) return result

    const container_id = result.data;
    if(hostRoot) this.copyToContainer(container_id, hostRoot, containerRoot)

    const command = `${this.base_command} ${this.sub_commands["start"]}`;
    const args: Array<string> = [container_id]
    var flags: Dictionary
    var shell_options: Dictionary
    if(job_options.synchronous) // run attached if specified
    {
      flags = {attach: {}, interactive: {}}
      shell_options = {stdio: "inherit"}
    }
    else // by default run detached
    {
      flags = {}
      shell_options = {stdio: "pipe"} // hide any output (id of process)
    }
    this.shell.exec(command, flags, args, shell_options)

    return result
  }

  // === START Job Helper Functions ============================================

  protected create(stack_path: string, command_string: string, run_options={})
  {
    const command = `${this.base_command} ${this.sub_commands["create"]}`;
    const args  = [this.imageName(stack_path), command_string]
    const flags = this.runFlags(run_options)
    var result = this.shell.output(command, flags, args, {stdio: "pipe"})
    if(result.success) result.data = result.data.trim()
    if(result.data === "") return new ValidatedOutput(false, [], [this.ERRORSTRINGS.EMPTY_CREATE_ID])
    return result
  }

  protected copyToContainer(id: string, hostPath: string, containerPath: string)
  {
    const command = `${this.base_command} ${this.sub_commands["copy"]}`;
    const args = [hostPath, `${id}:${containerPath}`]
    const flags = {}
    return this.shell.exec(command, flags, args)
  }

  protected copyFromContainer(id: string, hostPath: string, containerPath: string)
  {
    const command = `${this.base_command} ${this.sub_commands["copy"]}`;
    const args = [`${id}:${containerPath}`, hostPath]
    const flags = {}
    return this.shell.exec(command, flags, args)
  }

  // === END Job Helper Functions ============================================

  jobLog(id: string, lines: string="all")
  {
    var command = `${this.base_command} ${this.sub_commands["log"]}`;
    var args = [id]
    const lines_int = parseInt(lines)
    const flags = (isNaN(lines_int)) ? {} : {tail: `${lines_int}`}
    return new ValidatedOutput(true, this.shell.exec(command, flags, args))
  }

  jobAttach(id: string)
  {
    var command = `${this.base_command} ${this.sub_commands["attach"]}`;
    var args = [id]
    var flags = {}
    return new ValidatedOutput(true, this.shell.exec(command, flags, args))
  }

  jobExec(id: string, exec_command: string, exec_options:Dictionary={})
  {
    var command = `${this.base_command} ${this.sub_commands["exec"]}`;
    var args = [id, exec_command]
    const flags = this.execFlags(exec_options)
    return new ValidatedOutput(true, this.shell.exec(command, flags, args))
  }

  jobDelete(ids: Array<string>)
  {
    return new ValidatedOutput(true, [this.stop(ids), this.remove(ids)])
  }

  jobStop(ids: Array<string>)
  {
    return new ValidatedOutput(true, this.stop(ids))
  }

  // protected helpers

  protected stop(ids: Array<string>)
  {
    if(ids.length == 0) return;
    const command = `${this.base_command} ${this.sub_commands["stop"]}`;
    const args = ids
    const flags = {}
    return this.shell.exec(command, flags, args, {stdio: "pipe"})
  }

  protected remove(ids: Array<string>)
  {
    if(ids.length == 0) return;
    const command = `${this.base_command} ${this.sub_commands["remove"]}`;
    const args = ids
    const flags = {}
    return this.shell.exec(command, flags, args, {stdio: "pipe"})
  }

  jobInfo(stack_path: string, job_status: string = "") // Note: this allows for empty image_name. In which case it returns all running containers on host
  {
    const command = `${this.base_command} ${this.sub_commands["list"]}`;
    const args: Array<string> = []
    var   flags: Dictionary = {
      "a" : {},
      "no-trunc": {},
      "filter": [`label=runner=${cli_name}`]
    };
    if(stack_path) flags["filter"].push(`label=stack=${this.stackName(stack_path)}`)
    if(job_status) flags["filter"].push(`status=${job_status}`)
    this.addFormatFlags(flags, {format: "json"})
    var result = this.shell.output(command, flags, args, {}, this.json_output_format)

    // converts statusMessage to one of three states
    const shortStatus = (x: String) => {
      if(x.match(/^Exited/)) return "exited"
      if(x.match(/^Created/)) return "created"
      if(x.match(/^Up/)) return "running"
    }

    return (result.success) ? result.data?.map((x:Dictionary) => {
      return {
        id: x.ID,
        names: x.Names,
        command: x.Command,
        status: shortStatus(x.Status),
        stack: x?.Labels?.stack,
        labels: x?.Labels || {},
        statusString: x.Status
      }
    }) : {};
  }

  jobCopy(id: string, job_object: Dictionary, copy_all: boolean = false)
  {
    var result = this.job_copy_validator(job_object)
    if(!result.success)
      return new ValidatedOutput(false, undefined, [this.ERRORSTRINGS.INVALID_JOB])

    const hostRoot = job_object?.hostRoot
    const containerRoot = job_object?.containerRoot
    const resultPaths = job_object?.resultPaths

    if(hostRoot === undefined || containerRoot === undefined) // no copy necessary
      return new ValidatedOutput(true)

    const hostRoot_dirname = path.dirname(hostRoot)
    const hostRoot_basename = path.basename(hostRoot)
    const copy_all_flag = copy_all || resultPaths === undefined;
    const host_copydir = job_object.copyPath || hostRoot_dirname

    const container_copyfrom_paths = (copy_all_flag) ?
      [path.posix.join(containerRoot, hostRoot_basename)] :
      resultPaths.map((x:string) => path.posix.join(containerRoot, hostRoot_basename, x));
    const host_copyto_paths = (copy_all_flag) ?
      [host_copydir] :
      resultPaths.map((x:string) => path.posix.dirname(path.posix.join(host_copydir, x)));

    console.log("copy from:\t", container_copyfrom_paths)
    console.log("copy to:\t", host_copyto_paths)

    for(var i = 0; i < container_copyfrom_paths.length; i ++)
    {
      this.copyFromContainer(id, host_copyto_paths[i], container_copyfrom_paths[i])
    }

    return new ValidatedOutput(true)
  }

  jobToImage(id: string, image_name: string)
  {
    const command = `${this.base_command} ${this.sub_commands["commit"]}`
    const args  = [id, image_name]
    const flags = {}
    return this.shell.output(command, flags, args)
  }

  // Depricated: result shell was implemented by
  // > commiting the job (an exited container) to an image
  // > start a new container with bash using the same name using commited image
  // resultShell(id: string)
  // {
  //   const image_name = this.imageName(`result-${id}`)
  //   this.commit(id, image_name, {jobid: id})
  //   //this.delete(id)
  //   const command = `${this.base_command} ${this.sub_commands["run"]}`
  //   const args = `${image_name} bash`
  //   const flags = {
  //     'name:': {shorthand: false, id}
  //   }
  //   this.shell.exec(command, args, flags, {stdio: "inherit"})
  // }
  //
  // private commit(id: string, image_name: string, labels: object={}) // image name including optional tag
  // {
  //   const command = `${this.base_command} commit`
  //   const args  = [id, image_name]
  //   const flags = (labels === {}) ? {} : {
  //     "change": {
  //       shorthand: false,
  //       value: Object.keys(labels).map(k => `LABEL ${k}=${labels[k]}`)}
  //   }
  //   return this.shell.exec(command, flags, args, {stdio: "pipe"})
  // }

  imageName(stack_path: string)
  {
    return super.imageName(stack_path).toLowerCase() // Docker only accepts lowercase image names
  }

  protected runFlags(run_object: Dictionary)
  {
    var flags = {};
    if(this.run_schema_validator(run_object)) //verify docker-run schema
    {
      this.addFormatFlags(flags, run_object)
      this.addRemovalFlags(flags, run_object)
      this.addInteractiveFlags(flags, run_object)
      this.addWorkingDirFlags(flags, run_object)
      this.addDetachedFlags(flags, run_object)
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

  protected execFlags(exec_object: Dictionary)
  {
    var flags = {};
    if(this.exec_schema_validator(exec_object)) //verify docker-run schema
    {
      this.addInteractiveFlags(flags, exec_object)
      this.addWorkingDirFlags(flags, exec_object)
      this.addDetachedFlags(flags, exec_object)
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

  protected addDetachedFlags(flags:Dictionary, run_object: Dictionary)
  {
    if(run_object?.detached)
    {
      flags["d"] = {}
    }
  }

  protected addPortFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.ports?.length > 0)
    {
      flags["p"] = {
        escape: false,
        value: run_object.ports.map((po:Dictionary) => `${po.hostPort}:${po.containerPort}`)
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

  protected addSpecialFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.flags?.network) { // used for sharing DISPLAY variable
      flags["network"] = run_object.flags.network
    }
  }

  protected addMountFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.mounts?.length > 0)
    {
      flags["mount"] = {
        escape: false,
        value: run_object.mounts.map(this.mountObjectToFlagStr)
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

  protected addLabelFlags(flags: Dictionary, run_object: Dictionary)
  {
    if(run_object?.labels) {
      const keys = Object.keys(run_object.labels)
      flags["label"] = keys.map(k => `${k}=${run_object.labels[k]}`)
    }
  }

}
