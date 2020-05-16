// ===========================================================================
// Podman-Run-Driver: Controls Podman For Running containers
// ===========================================================================

import { ShellCommand } from "../../shell-command"
import { JobInfo, JobPortInfo } from '../abstract/run-driver'
import { DockerCliRunDriver, DockerCreateOptions }  from '../docker/docker-cli-run-driver'
import { parseJSON, parseLineJSON } from '../../functions/misc-functions'
import { ValidatedOutput } from '../../validated-output'
import { stack_path_label, Dictionary } from '../../constants'
import { DockerStackMountConfig, DockerStackResourceConfig } from '../../config/stacks/docker/docker-stack-configuration'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'

export class PodmanCliRunDriver extends DockerCliRunDriver
{
  protected base_command = 'podman'
  protected JSONOutputParser = parseJSON

  protected extractCommand(job_configuration: DockerJobConfiguration) : Array<string>
  {
    return job_configuration.command;
  }

  protected addJSONFormatFlag(flags: Dictionary)
  {
    flags["format"] = 'json'
  }

  protected extractJobInfo(raw_ps_data: Array<Dictionary>) : ValidatedOutput<Array<JobInfo>>
  {
    // NOTE: podman ps has a bad format for determining open ports.
    // This Function calls podman inspect to extract port information
    if(raw_ps_data.length == 0)
      return new ValidatedOutput(true, [])

    const ids = raw_ps_data.map((x:Dictionary) => x.ID)
    const result = parseLineJSON(
      this.shell.output(`${this.base_command} inspect`, {format: '{{json .HostConfig.PortBindings}}'}, ids, {})
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
      result.value.map((info:Dictionary, index: number) => {
        const id = ids[index];
        if(id) inspect_data[id] = {Ports: extractBoundPorts(info || {})}
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
          image: x.Image,
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

  protected addResourceFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    const valid_keys:Array<keyof DockerStackResourceConfig> = ["cpus", "gpu", "memory"] // podman does not support memory-swap
    valid_keys?.map((key:keyof DockerStackResourceConfig) => {
      if(run_object?.resources?.[key]) flags[key] = run_object.resources[key]
    })
  }

  protected mountObjectToFlagStr(mo: DockerStackMountConfig)
  {
    switch(mo.type)
    {
      case "bind":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.hostPath || "")},destination=${ShellCommand.bashEscape(mo.containerPath)}${(mo.readonly) ? ",readonly" : ""}`
      case "volume":
        return `type=${mo.type},source=${ShellCommand.bashEscape(mo.volumeName || "")},destination=${ShellCommand.bashEscape(mo.containerPath)},exec${(mo.readonly) ? ",readonly" : ""}`
      case "tmpfs":
        return `type=${mo.type},destination=${ShellCommand.bashEscape(mo.containerPath)}`
    }
  }

  protected selinuxBindMountObjectToFlagStr(mo: DockerStackMountConfig)
  {
    if(mo.type !== "bind" || !mo.hostPath) return []
    const selinux_str = 'z' // allow sharing with all containers
    return `${ShellCommand.bashEscape(mo.hostPath)}:${ShellCommand.bashEscape(mo.containerPath)}:${selinux_str}${(mo.readonly) ? ",readonly" : ""}`
  }

  protected addSpecialFlags(flags: Dictionary, run_object: DockerCreateOptions)
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
    if(run_object?.flags?.['network'])
    {
      flags["network"] = run_object?.flags?.['network']
    }
    return flags
  }

  protected addEntrypointFlags(flags: Dictionary, run_object: DockerCreateOptions)
  {
    if(run_object?.entrypoint)
    {
      flags["entrypoint"] = JSON.stringify(run_object['entrypoint'])
    }
  }

}
