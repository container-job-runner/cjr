// ===========================================================================
// Podman-Run-Driver: Controls Podman For Running containers
// ===========================================================================

import {quote} from 'shell-quote'
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
      flags["format"] = {shorthand: false, value: 'json'}
    }
  }

  protected mountObjectToFlagStr(mo: Dictionary)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},source=${mo.hostPath},destination=${quote([mo.containerPath])}${(mo.readonly) ? ",readonly" : ""}`
      case "volume":
        return `type=${mo.type},source=${mo.volumeName},destination=${quote([mo.containerPath])}${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${quote([mo.containerPath])}`
    }
  }

  protected runFlags(run_object: Dictionary)
  {
    var flags:Dictionary = super.runFlags(run_object)
    // append special podman run_flags
    if(run_object?.podman?.userns) { // used for consistant file permissions
      flags["userns"] = {shorthand: false, value: run_object.podman.userns}
    }
    if(run_object?.podman?.["security-opt"]) { // used for binding X11 directory
      flags["security-opt"] = {shorthand: false, value: run_object.podman["security-opt"]}
    }
    if(run_object?.podman?.network) { // used for sharing DISPLAY variable
      flags["network"] = {shorthand: false, value: run_object.podman.network}
    }
    return flags
  }

}
