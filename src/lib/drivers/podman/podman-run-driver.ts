// ===========================================================================
// Podman-Run-Driver: Controls Podman For Running containers
// ===========================================================================

import { ShellCommand } from "../../shell-command"
import { JobInfo, JobPortInfo } from '../abstract/run-driver'
import { DockerRunDriver }  from '../docker/docker-run-driver'
import { pr_vo_validator } from './schema/podman-run-schema'
import { PodmanStackConfiguration } from '../../config/stacks/podman/podman-stack-configuration'
import { parseJSON } from '../../functions/misc-functions'
import { ValidatedOutput } from '../../validated-output'
import { stack_path_label } from '../../constants'

// -- types --------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class PodmanRunDriver extends DockerRunDriver
{
  protected base_command = 'podman'
  protected outputParser = parseJSON
  protected run_schema_validator  = pr_vo_validator

  protected addFormatFlags(flags: Dictionary, run_flags: Dictionary)
  {
    if(run_flags?.format === "json") {
      flags["format"] = 'json'
    }
  }

  protected extractJobInfo(raw_ps_data: Array<Dictionary>) : ValidatedOutput<Array<JobInfo>>
  {
    // NOTE: podman ps has a bad format for determining open ports.
    // This Function calls podman inspect to extract port information
    const ids = raw_ps_data.map((x:Dictionary) => x.ID)
    const result = this.outputParser(
      this.shell.output(`${this.base_command} inspect`, {}, ids, {})
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
      result.data.map((info:Dictionary) => {
        const id = info?.['Id'];
        if(id) inspect_data[id] = {Ports: extractBoundPorts(info?.['HostConfig']['PortBindings'] || {})}
    });

    // converts status to one of three states
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
          stack: x?.Labels?.[stack_path_label] || "",
          labels: x?.Labels || {},
          ports: inspect_data?.[x.ID]?.Ports || [],
          status: x.Status
        }
      })
    )
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
