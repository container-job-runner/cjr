// ===========================================================================
// Settings: A class for getting and setting
// ===========================================================================

import {DockerRunDriver} from './docker-run-driver'
import {pr_ajv_validator} from './schema/podman-run-schema'
import {quote} from 'shell-quote'

export class PodmanRunDriver extends DockerRunDriver
{
  private base_command = 'podman'
  private json_output_format = "json"
  private run_schema_validator  = pr_ajv_validator

  private addFormatFlags(flags, run_flags: object)
  {
    if(run_flags?.format === "json") {
      flags["format"] = {shorthand: false, value: 'json'}
    }
  }

  private mountObjectToFlagStr(mo)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},destination=${quote([mo.containerPath])},source=${mo.hostPath}${(mo.readonly) ? ",readonly" : ""}`
      case "molume":
        return `type=${mo.type},destination=${quote([mo.molumeName])},source=${mo.hostPath}${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${quote([mo.containerPath])}`
    }
  }

  private runFlags(run_flags_object)
  {
    var flags = super.runFlags(run_flags_object)
    // append special podman run_flags
    if(run_flags_object?.podman?.userns)
    {
      flags["userns"] = {shorthand: false, value: run_flags_object.podman.userns}
    }
    return flags
  }

}
