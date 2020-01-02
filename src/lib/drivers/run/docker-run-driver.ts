// ===========================================================================
// Settings: A class for getting and setting
// ===========================================================================

import {RunDriver} from './rundriver'
import {quote} from 'shell-quote'
import {dr_ajv_validator} from './schema/docker-run-schema'
import {de_ajv_validator} from './schema/docker-exec-schema'
import {dj_ajv_validator} from './schema/docker-job-schema'
import {ajvValidatorToValidatedOutput} from '../../functions'
import {ValidatedOutput} from '../../validated-output'
import {PathTools} from './path-tools'
import * as path from 'path'

export class DockerRunDriver extends RunDriver
{
  private base_command = 'docker'
  private sub_commands = {
    run: "run",
    list: "ps",
    stop: "stop",
    attach: "attach",
    log: "logs",
    remove: "rm",
    create: "create",
    copy: "cp",
    start: "start",
    exec: "exec"
  }
  private json_output_format = "line_json"
  private job_schema_validator  = dj_ajv_validator
  private exec_schema_validator = de_ajv_validator
  private run_schema_validator  = dr_ajv_validator

  // job functions

  jobStart(stack_path: string, job_options: object, run_options: object={}){

    var result = ajvValidatorToValidatedOutput(this.job_schema_validator, job_options)
    if(result.success)
    {
      // copy variables for convience
      const hostRoot = job_options?.hostRoot
      const containerRoot = job_options?.containerRoot
      const command_str = job_options.command
      // force job to be interactive
      run_options["interactive"] = true;
      run_options["remove"] = job_options["removeOnExit"]
      if(job_options?.name) run_options["name"] = job_options["name"]
      result = this.create(stack_path, command_str, run_options)
      if(result.success)
      {
        const container_id = result.data;
        if(hostRoot) this.copyToContainer(container_id, hostRoot, containerRoot)
        const command = `${this.base_command} ${this.sub_commands["start"]}`;
        const args = [container_id]
        if(job_options.synchronous) // run attached if specified
        {
          var flags = {attach: {shorthand: false}}
          var shell_options = {stdio: "inherit"}
        }
        else // by default run detached
        {
          var flags = {}
          var shell_options = {stdio: "pipe"} // hide any output (id of process)
        }
        this.shell.sync(command, flags, args, shell_options)
      }
      return result
    }
    else
    {
        result.pushError(["job_options object did not pass validation."])
    }
    return result
  }

  // === START Job Helper Functions ============================================

  private create(stack_path: string, command_string: string, run_options={})
  {
    const command = `${this.base_command} ${this.sub_commands["create"]}`;
    const args  = [this.imageName(stack_path), command_string]
    const flags = this.runFlags(run_options)
    var result = this.shell.output(command, flags, args, {stdio: "pipe"})
    if(result.success) result.data = result.data.trim()
    return result
  }

  private copyToContainer(id: string, hostPath: string, containerPath: string)
  {
    const command = `${this.base_command} ${this.sub_commands["copy"]}`;
    const args = [hostPath, `${id}:${containerPath}`]
    const flags = {}
    return this.shell.sync(command, flags, args)
  }

  private copyFromContainer(id: string, hostPath: string, containerPath: string)
  {
    const command = `${this.base_command} ${this.sub_commands["copy"]}`;
    const args = [`${id}:${containerPath}`, hostPath]
    const flags = {}
    return this.shell.sync(command, flags, args)
  }

  // === END Job Helper Functions ============================================

  jobList(stack_path: string, json_format:boolean = false)
  {
    const command = `${this.base_command} ${this.sub_commands["list"]}`;
    const args = []
    var   flags = {
      "filter": {
        value: [`ancestor=${this.imageName(stack_path)}`, 'status=running'],
        shorthand: false}
    }
    if(json_format) this.addFormatFlags(flags, {format: "json"})
    return this.shell.sync(command, flags, args)
  }

  jobLog(id: string)
  {
    var command = `${this.base_command} ${this.sub_commands["log"]}`;
    var args = [id]
    var flags = {}
    return this.shell.sync(command, flags, args)
  }

  jobAttach(id: string)
  {
    var command = `${this.base_command} ${this.sub_commands["attach"]}`;
    var args = [id]
    var flags = {}
    return this.shell.sync(command, flags, args)
  }

  jobExec(id: string, exec_command: string, exec_options={})
  {
    var command = `${this.base_command} ${this.sub_commands["exec"]}`;
    var args = [id, exec_command]
    const flags = this.execFlags(exec_options)
    return this.shell.sync(command, flags, args)
  }

  jobDestroy(ids: array<string>)
  {
    return [this.stop(ids), this.remove(ids)]
  }

  jobStop(ids: array<string>)
  {
    return [this.stop(ids)]
  }

  // private helpers

  private stop(ids: array<string>)
  {
    const command = `${this.base_command} ${this.sub_commands["stop"]}`;
    const args = ids
    const flags = {}
    return this.shell.sync(command, flags, args, {stdio: "pipe"})
  }

  private remove(ids: array<string>)
  {
    const command = `${this.base_command} ${this.sub_commands["remove"]}`;
    const args = ids
    const flags = {}
    return this.shell.sync(command, flags, args, {stdio: "pipe"})
  }

  jobInfo(image_name: string) // Note: this allows for empty image_name. In which case it returns all running containers on host
  {
    const command = `${this.base_command} ${this.sub_commands["list"]}`;
    const args = []
    var   flags = {"no-trunc" : {shorthand: false}};
    if(image_name.length > 0) {
      flags["filter"] = {shorthand: false, value: `ancestor=${image_name}`}
    }
    this.addFormatFlags(flags, {format: "json"})
    var result = this.shell.output(command, flags, args, {}, this.json_output_format)
    return (result.success) ? result.data?.map(x => {return {id: x.ID, names: x.Names}}) : [];
  }

  // result functions

  resultList(stack_path: string, json_format:boolean = false)
  {
    const command = `${this.base_command} ${this.sub_commands["list"]}`;
    const args = []
    var   flags = {
      "a" : {shorthand: true},
      "filter": {
        value: [`ancestor=${this.imageName(stack_path)}`, 'status=stopped'],
        shorthand: false}
    }
    if(json_format) this.addFormatFlags(flags, {format: "json"})
    return this.shell.sync(command, flags, args)
  }

  resultDelete(ids: array<string>)
  {
    return this.remove(ids)
  }

  resultInfo(image_name: string) // Note: this allows for empty image_name. In which case it returns all running containers on host
  {
    const command = `${this.base_command} ${this.sub_commands["list"]}`;
    const args = []
    var   flags = {
      "a" : {shorthand: true},
      "no-trunc" : {shorthand: false},
      "filter" : {shorthand: false, value: ['status=stopped']}
    };
    if(image_name.length > 0) {
      flags["filter"].value.push(`ancestor=${image_name}`)
    }
    this.addFormatFlags(flags, {format: "json"})
    var result = this.shell.output(command, flags, args, {}, this.json_output_format)
    return (result.success) ? result.data?.map(x => {return {id: x.ID, names: x.Names}}) :[];
  }

  resultCopy(id: string, job_object: object, copy_all: boolean = false)
  {
    if(ajv_validate_job_object(job_object))
    {
      // Move Me Outiuse - all implementations may need this
      const hostRoot = job_object?.hostRoot
      const containerRoot = job_object?.containerRoot//?.replace(/\/$/, "")
      const resultPaths = job_object?.resultPaths

      if(hostRoot !== undefined && containerRoot !== undefined)
      {
        const hostRoot_dirname = path.dirname(hostRoot)
        const hostRoot_basename = path.basename(hostRoot)
        const containerRoot_dirname = path.posix.dirname(containerRoot)
        const copy_all_flag = copy_all || resultPaths === undefined;

        const container_copyfrom_paths = (copy_all_flag) ?
          [path.posix.join(containerRoot_dirname, hostRoot_basename)] :
          resultPaths.map(x => path.posix.join(containerRoot_dirname, hostRoot_basename, x));
        const host_copyto_paths = (copy_all_flag) ?
          [hostRoot_dirname] :
          resultPaths.map(x => path.posix.dirname(path.posix.join(hostRoot, x)));

        console.log("id:\t", id)
        console.log("copy from:\t", container_copyfrom_paths)
        console.log("copy to:\t", host_copyto_paths)

        for(var i = 0; i < container_copyfrom_paths.length; i ++)
        {
          this.copyFromContainer(id, host_copyto_paths[i], container_copyfrom_paths[i])
        }
      }

      return new ValidatedOutput(true)

    }
    return ValidatedOutput(false, undefined, ["job_options object did not pass validation."])
  }

  imageName(stack_path: string)
  {
    return super.imageName(stack_path).toLowerCase() // Docker only accepts lowercase image names
  }

  private runFlags(run_flags_object)
  {
    var flags = {};
    if(this.run_schema_validator(run_flags_object)) //verify docker-run schema
    {
      this.addFormatFlags(flags, run_flags_object)
      this.addRemovalFlags(flags, run_flags_object)
      this.addInteractiveFlags(flags, run_flags_object)
      this.addWorkingDirFlags(flags, run_flags_object)
      this.addDetachedFlags(flags, run_flags_object)
      this.addNameFlags(flags, run_flags_object)
      this.addPortFlags(flags, run_flags_object)
      this.addMountFlags(flags, run_flags_object)
    }
    return flags
  }

  private execFlags(exec_object)
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

  // === START Private Helper Functions for flag generation ====================

  private addFormatFlags(flags, run_flags: object)
  {
    if(run_flags?.format === "json") {
      flags["format"] = {shorthand: false, value: '{{json .}}'}
    }
  }

  private addRemovalFlags(flags, run_flags: object)
  {
    if(run_flags?.remove) {
      flags["rm"] = {shorthand: false}
    }
  }

  private addInteractiveFlags(flags, run_flags: object)
  {
    if(run_flags?.interactive == true)
    {
        flags["i"] = {shorthand: true}
        flags["t"] = {shorthand: true}
    }
  }

  private addWorkingDirFlags(flags:object, run_flags: object)
  {
    if(run_flags?.wd)
    {
      flags["w"] = {shorthand: true, value: run_flags.wd}
    }
  }

  private addNameFlags(flags:object, run_flags: object)
  {
    if(run_flags?.name)
    {
      flags["name"] = {shorthand: false, value: run_flags.name}
    }
  }

  private addDetachedFlags(flags:object, run_flags: object)
  {
    if(run_flags?.detached)
    {
      flags["d"] = {shorthand: true}
    }
  }

  private addPortFlags(flags, run_flags)
  {
    if(run_flags?.ports?.length > 0)
    {
      flags["p"] = {
        shorthand: true,
        escape: false,
        value: run_flags.ports.map(po => `${po.hostPort}:${po.containerPort}`)
      }
    }
  }

  private addMountFlags(flags, run_flags)
  {
    if(run_flags?.mounts?.length > 0)
    {
      flags["mount"] = {
        shorthand: false,
        sanitize: false,
        value: run_flags.mounts.map(this.mountObjectToFlagStr)
      }
    }
  }

  private mountObjectToFlagStr(mo)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},destination=${quote([mo.containerPath])},source=${mo.hostPath}${(mo.readonly) ? ",readonly" : ""},consistency=${mo.consistency || "consistent"}`
      case "molume":
        return `type=${mo.type},destination=${quote([mo.molumeName])},source=${mo.hostPath}${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${quote([mo.containerPath])}`
    }
  }

}
