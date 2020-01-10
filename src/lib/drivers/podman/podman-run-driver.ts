import {quote} from 'shell-quote'
import {DockerRunDriver} from '../docker/docker-run-driver'
import {pr_ajv_validator} from './schema/podman-run-schema'

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
        return `type=${mo.type},source=${mo.hostPath},destination=${quote([mo.containerPath])}${(mo.readonly) ? ",readonly" : ""}`
      case "volume":
        return `type=${mo.type},source=${mo.volumeName},destination=${quote([mo.containerPath])}${(mo.readonly) ? ",readonly" : ""}`
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
