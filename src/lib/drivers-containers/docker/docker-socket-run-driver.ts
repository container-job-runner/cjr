// ===========================================================================
// Docker-Socket-Run-Driver: Controls Docker Socket For Running containers
// ===========================================================================

import chalk = require('chalk')
import { ValidatedOutput } from "../../validated-output"
import { ShellCommand } from "../../shell-command"
import { RunDriver, JobInfo, JobInfoFilter, NewJobInfo, JobState, jobFilter } from '../abstract/run-driver'
import { DockerStackConfiguration, DockerStackPortConfig, DockerStackMountConfig } from '../../config/stacks/docker/docker-stack-configuration'
import { Curl, RequestOutput } from '../../curl'
import { cli_name, label_strings, Dictionary } from '../../constants'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'
import { ExecConfiguration } from '../../config/exec/exec-configuration'
import { DockerAPIPostProcessor } from './docker-socket-build-driver'

// === START API TYPES =========================================================

export type DockerAPI_CreateObject =
{
  "Image"?: string,
  "Hostname"?: string,
  "User"?: string,
  "Entrypoint"?: Array<string>,
  "Cmd"?: Array<string>,
  "WorkingDir"?: string,
  "Env"?: Array<string>, // strings should be of form VAR=VALUE
  "ExposedPorts"?: { [key:string] : {} } // key is <port>/<protocol> (e.g. 3000/tcp)
  "HostConfig"?: DockerAPI_HostConfig,
  "Labels"?: {[key: string] : string},
  "MacAddress"?: string,
  "AttachStdin"?: boolean,
  "AttachStdout"?: boolean,
  "AttachStderr"?: boolean,
  "OpenStdin"?: boolean,
  "Tty"?: boolean,
}

type DockerAPI_HostConfig =
{
  "Binds"?: Array<string>,
  "Tmpfs"?: {[key: string]: any}, // containerPath : tempfs options (see: https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate)
  "Mounts"?: Array<DockerAPI_Mount>,
  "PortBindings"?: {[key: string]: Array<DockerAPI_HostPortConfig>}, // key is <port>/<protocol> (e.g. 3000/tcp)
  "NetworkMode"?: "bridge" | "host" | "none",
  "CpuPeriod"?: number,
  "CpuQuota"?: number,
  "Memory"?: number,
  "MemorySwap"?: number
  "Privileged"?: boolean
  "SecurityOpt"?: string[]
  "IpcMode"?: string
}

type DockerAPI_Mount =
{
  "Target": string,
  "Source": string,
  "Type": "bind"|"volume"|"tmpfs",
  "ReadOnly"?: boolean,
  "Consistency"?: "default" | "consistent" | "cached" | "delegated"
}

type DockerAPI_HostPortConfig =
{
  "HostIp"?: string,
  "HostPort": string
}

// === END API TYPES ===========================================================

export class DockerSocketRunDriver extends RunDriver
{
  protected selinux: boolean
  protected socket: string
  protected curl: Curl
  protected base_command: string = "docker"
  protected labels = {"invisible-on-exit": "cjr-ios"} // jobs with this label will not appear in JobInfo array
  protected curlPostProcessor = DockerAPIPostProcessor

  protected ERRORSTRINGS = {
    BAD_RESPONSE: chalk`{bold Bad API Response.} Is Docker running?`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`,
    FAILED_CREATE_VOLUME: chalk`{bold Unable to create volume.}`,
    FAILED_COMMIT: (id:string) => chalk`{bold Unable to create image from job ${id}.}`,
    FAILED_STOP: (id:string) => chalk`{bold Unable to stop job ${id}}`,
    FAILED_DELETE: (id:string) => chalk`{bold Unable to delete job ${id}}`
  }

  constructor(shell: ShellCommand, options: {selinux: boolean, socket: string})
  {
    super(shell)
    this.selinux = options?.selinux || false
    this.socket = options.socket
    this.curl = new Curl(shell, {
      "unix-socket": options.socket,
      "base-url": "http://v1.24"
    })
  }

  jobInfo(filter?: JobInfoFilter) : ValidatedOutput<Array<JobInfo>>
  {
    // -- make api request -----------------------------------------------------
    const api_result = this.curlPostProcessor(
      this.curl.get({
        "url": "/containers/json",
        "params": {
          all: true,
          filters: JSON.stringify({"label": [`runner=${cli_name}`]})
        }
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_result, 200))
      return new ValidatedOutput(false, [])

    // -- convert API response into Array<JobInfo> -----------------------------
    const job_info: Array<JobInfo> = api_result.value.body?.map( (cntr: Dictionary):JobInfo => {
      return {
        id:      cntr.Id,
        image:   cntr.Image,
        names:   cntr.Names,
        command: cntr.Command,
        status:  cntr.Status,
        state:   cntr.State?.toLowerCase(),
        stack:   cntr.Labels?.[label_strings.job["stack-path"]] || "",
        labels:  cntr.Labels || {},
        ports:   cntr.Ports?.map((prt:Dictionary) => {
          return {
            ip: prt.IP,
            containerPort: prt.PrivatePort,
            hostPort: prt.PublicPort
          }
        }) || [],
      }
    }) || [];

    // -- hide any stopped jobs with invisible-on-exit -------------------------
    const hidden_filter = {
      states: ["exited"] as Array<JobState>,
      labels: {[this.labels['invisible-on-exit']]: ["true"]}
    }

    // -- filter jobs and return -----------------------------------------------
    return new ValidatedOutput(true,
      jobFilter(
        jobFilter(job_info, filter),
        hidden_filter,
        {blacklist: true, operator: "and"}
      )
    )
  }

  // NOTE: presently does not support auto removal for async jobs
  jobStart(configuration: DockerJobConfiguration, stdio: "inherit"|"pipe"|"ignore"): ValidatedOutput<NewJobInfo>
  {
    const failure_response = {id: "", "exit-code": 0, output: "", error: ""}
    configuration.addLabel("runner", cli_name) // add mandatory label
    if(configuration.remove_on_exit && !configuration.synchronous)
      configuration.addLabel(this.labels['invisible-on-exit'], "true")

    // -- make api request -----------------------------------------------------
    const api_request = this.curlPostProcessor(
      this.curl.post({
        "url": "/containers/create",
        "encoding": "json",
        "body": this.generateCreateData(configuration),
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_request, 201) || !api_request.value.body?.Id)
      return new ValidatedOutput(false, failure_response)

    const id:string = api_request.value.body.Id;
    if(configuration.synchronous) // -- use docker cli -------------------------
    {
      const command = `${this.base_command} start`;
      const args: Array<string> = [id]
      const flags = (configuration.synchronous) ? {attach: {}, interactive: {}} : {}
      const shell_options = { "stdio": stdio }
      const exec_result = this.shell.exec(command, flags, args, shell_options)

      if(configuration.remove_on_exit)
        this.jobDelete([id])

      return new ValidatedOutput(true, {
        "id": id,
        "exit-code": ShellCommand.status(exec_result.value),
        "output": ShellCommand.stdout(exec_result.value),
        "error": ShellCommand.stderror(exec_result.value)
      })
    }
    else // --- user docker API ------------------------------------------------
    {
      // -- make api request ---------------------------------------------------
      const api_request = this.curlPostProcessor(
        this.curl.post({
          "url": `/containers/${id}/start`,
          "encoding": "json",
          "body": {},
        })
      )

      // -- check request status -----------------------------------------------
      if(!this.validAPIResponse(api_request, 204))
        return new ValidatedOutput(false, failure_response)

      return new ValidatedOutput(true, {
        "id": id,
        "exit-code": 0,
        "output": "",
        "error": ""
      })
    }
  }

  jobLog(id: string, lines: string="all") : ValidatedOutput<string>
  {
    // -- make api request -----------------------------------------------------
    var api_result = this.curlPostProcessor(
      this.curl.get({
        "url": `/containers/${id}/logs`,
        "params": {
          "tail":   lines,
          "stdout": true,
          "stderr": true
        }
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(api_result, 200))
      return new ValidatedOutput(false, "")

    // -- return jobs ----------------------------------------------------------
    return new ValidatedOutput(true, api_result.value.body?.trim())
  }

  jobAttach(id: string) : ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined).absorb(
      this.shell.exec(`${this.base_command} attach`, {}, [id])
    )
  }

  jobExec(id: string, configuration: ExecConfiguration, stdio: "inherit"|"pipe"|"ignore") : ValidatedOutput<NewJobInfo>
  {
    if(configuration.synchronous) // -- use docker cli -------------------------
    {
      const command = `${this.base_command} exec`
      const flags = ShellCommand.removeEmptyFlags({
        'w': configuration.working_directory,
        'd': (configuration.synchronous) ? undefined : {},
        't': {},
        'i': (stdio === "pipe") ? undefined : {} // only enable interactive flag if stdio is inherited. The node shell with stdio='pipe' is not tty and the error 'the input device is not TTY' will cause problems for programs that use TTY since -t flag is active
      })
      const args = [id].concat(configuration.command)
      const shell_options = { "stdio": stdio }
      const result = this.shell.exec(command, flags, args, shell_options)

      return new ValidatedOutput(true, {
        "id": "", // no id for docker cli exec
        "output": ShellCommand.stdout(result.value).replace(/\r\n$/, ""),
        "error": ShellCommand.stderror(result.value),
        "exit-code": ShellCommand.status(result.value)
      })
    }
    else // --- user docker API ------------------------------------------------
    {
      const failure_response = {id: "", "exit-code": 0, output: "", error: ""}
      const api_create_request = this.curlPostProcessor(
        this.curl.post({
          "url": `/containers/${id}/exec`,
          "encoding": "json",
          "body": {
            "AttachStdin": true,
            "AttachStdout": true,
            "AttachStderr": true,
            "OpenStdin": true,
            "Tty": true,
            "Cmd": configuration.command,
            "WorkingDir": configuration.working_directory,
          }
        })
      )

      // -- check request status -------------------------------------------------
      if(!this.validAPIResponse(api_create_request, 201) || !api_create_request.value.body?.Id)
        return new ValidatedOutput(false, failure_response)

      const exec_id:string = api_create_request.value.body?.Id
      const api_start_request = this.curlPostProcessor(
        this.curl.post({
          "url": `/exec/${exec_id}/start`,
          "encoding": "json",
          "body": {tty: true, detach: true},
        })
      )

      // -- check request status -------------------------------------------------
      if(!this.validAPIResponse(api_start_request, 200))
        return new ValidatedOutput(false, failure_response)

      return new ValidatedOutput(true, {
        "id": exec_id,
        "output": "",
        "error": "",
        "exit-code": 0
      })
    }
  }

  jobToImage(id: string, image_name: string): ValidatedOutput<string>
  {
    const [repo, tag] = image_name.split(':')
    const params:Dictionary = {"container": id}
    if(repo) params["repo"] = repo
    if(tag) params["tag"] = tag

    const api_request = this.curlPostProcessor(
      this.curl.post({
        "url": "/commit",
        "params": params,
        "encoding": "json",
        "body": {},
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(api_request, 201) || !api_request.value?.body?.Id)
      return new ValidatedOutput(false, "").pushError(this.ERRORSTRINGS.FAILED_COMMIT(id))

    return new ValidatedOutput(true, api_request.value.body.Id)
  }

  jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput<undefined>(true, undefined)

    ids.map((id:string) => {
      const api_request = this.curlPostProcessor(
        this.curl.post({
          "url": `/containers/${id}/stop`,
          "body": {t: 10}
        })
      )
      result.absorb(api_request);
      if(!this.validAPIResponse(api_request, 204))
        result.pushError(this.ERRORSTRINGS.FAILED_STOP(id))
    })

    return result
  }

  jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)

    ids.map((id:string) => {
      // -- make api request -----------------------------------------------------
      const api_result = this.curlPostProcessor(
        this.curl.delete({
          "url": `/containers/${id}`,
        })
      )
      // -- check request status -------------------------------------------------
      result.absorb(api_result)
      if(!this.validAPIResponse(api_result, 204))
        result.pushError(this.ERRORSTRINGS.FAILED_DELETE(id))
    })

    return result
  }

  volumeCreate(options?:Dictionary): ValidatedOutput<string>
  {
    const data:Dictionary = {}
    if(options?.name) data.Name = options.name
    if(options?.driver) data.Driver = options.driver
    if(options?.labels) data.Labels = options.labels

    // -- make api request -----------------------------------------------------
    const api_request = this.curlPostProcessor(
      this.curl.post({
        "url": "/volumes/create",
        "encoding": "json",
        "body": data
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_request, 201) || !api_request.value.body?.Name)
      return new ValidatedOutput(false, "")

    const id:string = api_request.value.body.Name;
    return new ValidatedOutput(true, id)
  }

  volumeDelete(ids: Array<string>): ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)

    ids.map((id:string) => {
      // -- make api request -----------------------------------------------------
      const api_result = this.curlPostProcessor(
        this.curl.delete({
          "url": `/volumes/${id}`,
        })
      )
      // -- check request status -------------------------------------------------
      result.absorb(api_result)
      if(!this.validAPIResponse(api_result, 204))
        result.pushError(this.ERRORSTRINGS.FAILED_DELETE(id))
    })

    return result
  }

  protected validAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!response.success) return false
    if(code !== undefined && response.value.header.code !== code) return false
    return true
  }

  protected validJSONAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!this.validAPIResponse(response, code)) return false
    if(response.value.header.type !== "application/json") return false
    return true
  }

  protected generateCreateData(job_configuration: DockerJobConfiguration) : DockerAPI_CreateObject
  {
    const create_object: DockerAPI_CreateObject = {}

    this.addApiCreateObjectMounts(job_configuration.stack_configuration, create_object)
    this.addApiCreateObjectPorts(job_configuration.stack_configuration, create_object)
    this.addApiCreateObjectEnvironment(job_configuration.stack_configuration, create_object)
    this.addApiCreateObjectResourceLimits(job_configuration.stack_configuration, create_object)
    this.addApiCreateObjectMisc(job_configuration.stack_configuration, create_object)
    create_object.Image = job_configuration.stack_configuration.getImage()

    const job_props: DockerAPI_CreateObject = {
      "AttachStdin": true,
      "AttachStdout": true,
      "AttachStderr": true,
      "OpenStdin": true,
      "Tty": true,
      "Cmd": job_configuration.command,
      "WorkingDir": job_configuration.working_directory,
      "Labels": job_configuration.labels
    }

    return {
      ... create_object,
      ... job_props
    }
  }

  // === START API Functions for generating CreateObject ===================================================

  protected addApiCreateObjectMounts(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  {
    // -- exit if no mounts are present in configuration  ----------------------
    if(!configuration.config?.mounts)
      return

    // -- create any missing fields --------------------------------------------
    if(!create_object.HostConfig)
      create_object.HostConfig = {}
    if(!create_object.HostConfig.Mounts)
      create_object.HostConfig.Mounts = []
    if(!create_object.HostConfig.Binds)
      create_object.HostConfig.Binds = []

    // -- add mounts -----------------------------------------------------------
    const mounts = create_object.HostConfig.Mounts
    const binds  = create_object.HostConfig.Binds
    configuration.config?.mounts?.map((m: DockerStackMountConfig) => {
      // -- volumes ------------------------------------------------------------
      if(m?.type === 'volume' && m?.containerPath && m?.volumeName)
      {
        const mount: DockerAPI_Mount = {"Type": "volume", "Source": m.volumeName, "Target": m.containerPath}
        if(m.readonly) mount.ReadOnly = true
        mounts.push(mount)
      }
      // -- binds --------------------------------------------------------------
      else if(m?.type === 'bind' && m?.containerPath && m?.hostPath)
      {
        if(!this.selinux && !m?.selinux) // no-selinux
        {
          const mount: DockerAPI_Mount = {"Type": "bind", "Source": m.hostPath, "Target": m.containerPath}
          if(m.readonly) mount.ReadOnly = true
          if(['consistent', 'delegated', 'cached'].includes(m.consistency || "")) mount.Consistency = m.consistency
          mounts.push(mount)
        }
        else // se-linux (use binds)
        {
          const options:Array<string> = ['z']
          if(m.readonly) options.push('ro')
          binds.push(`${m.hostPath}:${m.containerPath}:${options.join(',')}`)
        }
      }
      // -- tempfs -------------------------------------------------------------
      else if(m?.type === 'tmpfs' && m?.containerPath)
      {
        const mount: DockerAPI_Mount = {"Type": "tmpfs", "Source": "", "Target": m.containerPath}
        mounts.push(mount)
      }
    })
  }

  protected addApiCreateObjectPorts(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  {
    // -- exit if no ports are present in configuration  ----------------------
    if(!configuration.config?.ports)
      return

    // -- create any missing fields --------------------------------------------
    if(!create_object.HostConfig)
      create_object.HostConfig = {}
    if(!create_object.HostConfig.PortBindings)
      create_object.HostConfig.PortBindings = {}
    if(!create_object.ExposedPorts)
      create_object.ExposedPorts = {}

    // -- add ports -----------------------------------------------------------
    const ports = create_object.HostConfig.PortBindings
    const exposed_ports = create_object.ExposedPorts
    configuration.config?.ports?.map((p: DockerStackPortConfig) => {
      if(p?.hostPort && p?.containerPort)
      {
         const key = `${p.containerPort}/tcp`
         const port: Array<DockerAPI_HostPortConfig> = [{'HostPort': `${p.hostPort}`}]
         if(p.hostIp) port[0]['HostIp'] = p.hostIp
         ports[key] = port
         exposed_ports[key] = {}
      }
    })
  }

  protected addApiCreateObjectEnvironment(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  {
    // -- exit if no environment are present in configuration  -----------------
    if(configuration.config?.environment == undefined)
      return

    // -- create any missing fields --------------------------------------------
    if(!create_object.Env)
      create_object.Env = []

    // -- add environments -----------------------------------------------------
    const co_env = create_object.Env
    const env = configuration.config.environment
    Object.keys(env).map( (env_name:string) => {
      co_env.push(`${env_name}=${env[env_name]}`)
    })
  }

  protected addApiCreateObjectResourceLimits(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  {
    // -- exit if no mounts are present in configuration  ----------------------
    if(!configuration.config?.resources)
      return

    // -- create any missing fields --------------------------------------------
    if(!create_object.HostConfig)
      create_object.HostConfig = {}

    // -- add resource limits --------------------------------------------------
    const bitParser = (value: string|undefined) : number => {

      if(!value) return -1

      // extracts integer before b,k,m,g
      const extract = (s:string) => parseInt(
        s.match(/^[0-9]+(?=[bkmg])/)?.pop() || ""
      )

      if(/^[0-9]+b/.test(value))
        return extract(value)
      else if(/^[0-9]+k/.test(value))
        return 1000 * extract(value)
      else if(/^[0-9]+m/.test(value))
        return 1000000 * extract(value)
      else if(/^[0-9]+g/.test(value))
        return 1000000000 * extract(value)
      return -1
    }

    // -- add resource limits --------------------------------------------------
    const memory = bitParser(configuration.config?.resources?.['memory'])
    if(memory != -1)
      create_object.HostConfig.Memory = memory

    const memory_swap = bitParser(configuration.config?.resources?.['memory-swap'])
    if(memory_swap != -1)
      create_object.HostConfig.MemorySwap = memory_swap

    // -- add cpu limits -------------------------------------------------------
    const cpus = parseFloat(configuration.config?.resources?.['cpus'] || "")
    if(!isNaN(cpus)) {
      create_object.HostConfig.CpuPeriod = 100000
      create_object.HostConfig.CpuQuota  = Math.round(100000 * cpus)
    }

  }

  protected addApiCreateObjectMisc(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  {
    // -- Network Mode ---------------------------------------------------------
    if(["bridge", "host", "none"].includes(configuration.config?.flags?.network || "")) {
      if(create_object?.HostConfig == undefined) create_object.HostConfig = {}
      create_object.HostConfig.NetworkMode = (configuration.config?.flags?.network as "bridge"|"host"|"none")
    }
    // -- MAC Address ----------------------------------------------------------
    if(configuration.config?.flags?.["mac-address"]) {
      create_object.MacAddress = configuration.config.flags["mac-address"]
    }
    // -- Entrypoint -----------------------------------------------------------
    if(configuration.config?.entrypoint)
      create_object.Entrypoint = configuration.config?.entrypoint
    // -- User -----------------------------------------------------------------
    if(configuration.config.flags?.['user'])
      create_object.User = configuration.config.flags?.['user']
    // -- Privileged -----------------------------------------------------------
    if(configuration.config.flags?.['privileged'] === "true" || configuration.config.flags?.['docker-privileged'] === "true")
    {
       if(create_object?.HostConfig == undefined) create_object.HostConfig = {}
       create_object.HostConfig.Privileged = true
    }
    // -- Security Opt ---------------------------------------------------------
    if(configuration.config.flags?.['docker-security-opt'] || configuration.config.flags?.['security-opt'] )
    {
        if(create_object?.HostConfig == undefined) create_object.HostConfig = {}
        const raw_value = configuration.config.flags["docker-security-opt"] || configuration.config.flags["security-opt"]
        create_object.HostConfig.SecurityOpt = raw_value.split(/\s+/)
    }
    // -- Hostname -------------------------------------------------------------
    if(configuration.config.flags?.['hostname'])
    {
        create_object.Hostname = configuration.config.flags.hostname
    }
    // -- IPC Mode -------------------------------------------------------------
    if(configuration.config.flags?.['ipc'])
    {
        if(create_object?.HostConfig == undefined) create_object.HostConfig = {}
        create_object.HostConfig.IpcMode = configuration.config.flags['icp']
    }
  }

  // === END API Functions =====================================================

}
