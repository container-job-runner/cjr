// ===========================================================================
// Podman-Run-Driver: Controls Podman For Running containers
// ===========================================================================

import {ShellCommand} from "../../shell-command"
import {DockerRunDriver} from '../docker/docker-run-driver'
import {pr_vo_validator} from './schema/podman-run-schema'
import {PodmanStackConfiguration} from '../../config/stacks/podman/podman-stack-configuration'

// -- types --------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class PodmanRunDriver extends DockerRunDriver
{
  protected base_command = 'podman'
  protected json_output_format = "json"
  protected run_schema_validator  = pr_vo_validator

  protected addFormatFlags(flags: Dictionary, run_flags: Dictionary)
  {
    if(run_flags?.format === "json") {
      flags["format"] = 'json'
    }
  }

  protected extractJobInfo(raw_ps_data: Array<Dictionary>)
  {
    // NOTE: podman ps has a bad format for determining open ports.
    // This Function calls podman inspect to extract port information
    const ids = raw_ps_data.map((x:Dictionary) => x.ID)
    const result = this.shell.output(
      `${this.base_command} inspect`,
      {},
      ids,
      {},
      'json'
    )
    if(!result.success) return []
    // -- function for extracting port information for inspect
    const extractBoundPorts = (d:Dictionary) => {
      const bound_ports:Array<number> = []
      Object.keys(d).map((k:string) => {
        const host_port = d[k]?.pop()?.HostPort; // assumes form {"PORTKEY": [{hostPort: "NUMBER"}], "PORTKEY": [{hostPort: "NUMBER"}]}
        if(host_port && !isNaN(parseInt(host_port))) bound_ports.push(parseInt(host_port))
      })
      return bound_ports
    }
    // -- extract label & port data -----------------------------------------------
    const inspect_data:Dictionary = {}
      result.data.map((info:Dictionary) => {
        const id = info?.['Id'];
        if(id) inspect_data[id] = {PortBindings: extractBoundPorts(info?.['HostConfig']['PortBindings'] || {})}
    });

    // converts statusMessage to one of three states
    const shortStatus = (x: String) => {
      if(x.match(/^Exited/)) return "exited"
      if(x.match(/^Created/)) return "created"
      if(x.match(/^Up/)) return "running"
    }

    return raw_ps_data.map((x:Dictionary) => {
      return {
        id: x.ID,
        names: x.Names,
        command: x.Command,
        status: shortStatus(x.Status),
        stack: x?.Labels?.stack || "",
        labels: x?.Labels || {},
        hostPortBindings: inspect_data?.[x.ID]?.PortBindings || [],
        statusString: x.Status
      }
    })
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
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.volumeName)},destination=${ShellCommand.bashEscape(mo.containerPath)},exec${(mo.readonly) ? ",readonly" : ""}`
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
    if(run_object?.flags?.['mac-address'])
    {
      flags["mac-address"] = run_object?.flags?.['mac-address']
    }
    if(run_object?.flags?.['net'])
    {
      flags["net"] = run_object?.flags?.['net']
    }
    return flags
  }

  emptyConfiguration()
  {
    return new PodmanStackConfiguration()
  }

}
