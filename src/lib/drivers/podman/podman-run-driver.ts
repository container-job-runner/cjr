// ===========================================================================
// Podman-Run-Driver: Controls Podman For Running containers
// ===========================================================================

import {ShellCommand} from "../../shell-command"
import {DockerRunDriver} from '../docker/docker-run-driver'
import {pr_ajv_validator} from './schema/podman-run-schema'

// -- types --------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class PodmanRunDriver extends DockerRunDriver
{
  protected base_command = 'podman'
  protected json_output_format = "json"
  protected run_schema_validator  = pr_ajv_validator

  protected addFormatFlags(flags: Dictionary, run_flags: Dictionary)
  {
    if(run_flags?.format === "json") {
      flags["format"] = 'json'
    }
  }

  protected addResourceFlags(flags: Dictionary, run_object: Dictionary)
  {
    const valid_keys = ["cpus", "gpu", "memory"] // podman does not support swap-memory
    const keys = Object.keys(run_object?.resources || {})
    keys?.map((key:string) => {
      if(valid_keys.includes(key)) flags[key] = run_object?.resources[key]
    })
  }

  protected mountObjectToFlagStr(mo: Dictionary)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.hostPath)},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""}`
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
    return `${ShellCommand.bashEscape(mo.hostPath)}:${ShellCommand.bashEscape(mo.containerPath)}:${selinux_str}${(mo.readonly) ? ",readonly" : ""}`
  }

  protected addSpecialFlags(flags: Dictionary, run_object: Dictionary)
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

}
