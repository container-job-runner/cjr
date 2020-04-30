// ===========================================================================
// Docker-Socket-Run-Driver: Controls Docker Socket For Running containers
// ===========================================================================

import * as chalk from 'chalk'
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { RunDriver, JobState, JobInfo, JobInfoFilter, NewJobInfo } from '../abstract/run-driver'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { Curl, RequestOutput } from '../../curl'
import { cli_name, stack_path_label, Dictionary } from '../../constants'
import { spawn } from 'child_process'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'
import { DockerExecConfiguration } from '../../config/exec/docker-exec-configuration'
import { ExecConstrutorOptions } from '../../config/exec/exec-configuration'
import { trimTrailingNewline } from '../../functions/misc-functions'

export class DockerSocketRunDriver extends RunDriver
{
  protected curl: Curl
  protected base_command: string = "docker"
  protected labels = {"invisible-on-stop": "IOS"}

  protected ERRORSTRINGS = {
    BAD_RESPONSE: chalk`{bold Bad API Response.} Is Docker running?`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`,
    FAILED_CREATE_VOLUME: chalk`{bold Unable to create volume.}`,
    FAILED_COMMIT: (id:string) => chalk`{bold Unable to create image from job ${id}.}`,
    FAILED_STOP: (id:string) => chalk`{bold Unable to stop job ${id}}`,
    FAILED_DELETE: (id:string) => chalk`{bold Unable to delete job ${id}}`
  }

  constructor(shell: ShellCommand, options: {tag: string, selinux: boolean, socket: string})
  {
    super(shell, options.tag)
    this.curl = new Curl(shell, {
      "unix-socket": options.socket,
      "base-url": "http://v1.24"
    })
  }

  jobInfo(filter?: JobInfoFilter) : ValidatedOutput<Array<JobInfo>>
  {
    // -- make api request -----------------------------------------------------
    const api_result = this.curl.get({
      "url": "/containers/json",
      "params": {
        all: true,
        filters: JSON.stringify({"label": [`runner=${cli_name}`]})
      }
    });

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_result, 200))
      return new ValidatedOutput(false, [])

    // -- convert API response into Array<JobInfo> -----------------------------
    const job_info: Array<JobInfo> = api_result.value.body?.map( (cntr: Dictionary) => {
      return {
        id:      cntr.Id,
        names:   cntr.Names,
        command: cntr.Command,
        status:  cntr.Status,
        state:   cntr.State?.toLowerCase(),
        stack:   cntr.Labels?.[stack_path_label] || "",
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

    // -- remove any stopped jobs with invisible-on-stop flag?
    //"labels": { [stack_path_label] : stack_paths }

    // -- filter jobs and return -----------------------------------------------
    return new ValidatedOutput(true, this.jobFilter(job_info, filter))
  }

  // NOTE: presently does not support auto removal for async jobs
  jobStart(configuration: DockerJobConfiguration, stdio:"inherit"|"pipe"): ValidatedOutput<NewJobInfo>
  {
    const failure_response = {id: "", "exit-code": 0, output: ""}
    configuration.addLabel("runner", cli_name) // add mandatory label
    if(configuration.remove_on_exit && !configuration.synchronous)
      configuration.addLabel(this.labels['invisible-on-stop'], "true")

    // -- make api request -----------------------------------------------------
    const api_request = this.curl.post({
      "url": "/containers/create",
      "encoding": "json",
      "body": configuration.apiContainerCreateObject(),
    })

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_request, 200) || !api_request.value.body?.Id)
      return new ValidatedOutput(false, failure_response)

    const id:string = api_request.value.body.Id;
    // -- run job using docker command (allows for sync) ------------
    const command = `${this.base_command} start`;
    const args: Array<string> = [id]
    const flags = (configuration.synchronous) ? {attach: {}, interactive: {}} : {}
    const shell_options = {stdio: (stdio == "pipe") ? "pipe" : "inherit"}
    const exec_result = this.shell.exec(command, flags, args, shell_options)

    if(configuration.remove_on_exit && configuration.synchronous)
      this.jobDelete([id])

    return new ValidatedOutput(true, {
        "id": id,
        "exit-code": ShellCommand.status(exec_result.value),
        "output": ShellCommand.stdout(exec_result.value)
    })

  }

  jobLog(id: string, lines: string="all") : ValidatedOutput<string>
  {
    // -- make api request -----------------------------------------------------
    var api_result = this.curl.get({
      "url": `/containers/${id}/logs`,
      "params": {
        "tail":   lines,
        "stdout": true,
        "stderr": true
      }
    })

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

  jobExec(id: string, configuration: DockerExecConfiguration, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>
  {

    if(configuration.synchronous) // use docker command
    {
      const command = `${this.base_command} exec`
      var flags:Dictionary = {t: {}}
      if(configuration.interactive && stdio == "inherit") // only enable interactive flag if stdio is inherited. The node shell with stdio='pipe' is not tty and the error 'the input device is not TTY' will occur since -t flag is active
        flags['i'] = {}
      if(configuration.working_directory) flags['w'] = configuration.working_directory
      const args = [id].concat(configuration.command)
      const shell_options = (stdio === "pipe") ? {stdio: "pipe"} : {stdio: "inherit"}

      const result = this.shell.exec(command, flags, args, shell_options)
      return new ValidatedOutput(true, {
        "id": "", // no idea for docker cli exec
        "output": ShellCommand.stdout(result.value).replace(/\r\n$/, ""),
        "exit-code": ShellCommand.status(result.value)
      })
    }
    else // user docker API
    {
      const failure_response = {id: "", "exit-code": 0, output: ""}
      const api_create_request = this.curl.post({
        "url": `/containers/${id}/exec`,
        "encoding": "json",
        "body": configuration.apiExecObject(),
      })

      // -- check request status -------------------------------------------------
      if(!this.validAPIResponse(api_create_request, 201) || !api_create_request.value.body?.Id)
        return new ValidatedOutput(false, failure_response)

      const exec_id:string = api_create_request.value.body?.Id
      const api_start_request = this.curl.post({
        "url": `/exec/${exec_id}/start`,
        "encoding": "json",
        "body": {tty: true, detach: true},
      })

      // -- check request status -------------------------------------------------
      if(!this.validAPIResponse(api_start_request, 200))
        return new ValidatedOutput(false, failure_response)

      return new ValidatedOutput(true, {
        "id": exec_id,
        "output": "",
        "exit-code": 0
      })
    }
  }

  jobToImage(id: string, image_name: string): ValidatedOutput<string>
  {
    const [repo, tag] = image_name.split(':')
    const params:Dictionary = {"container": id}
    if(repo) params["repo"] = repo
    if(tag) params["tag"] = image_name

    const api_request = this.curl.post({
      "url": "/commit",
      "params": params,
      "encoding": "json",
      "body": {},
    })

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(api_request, 201) || !api_request.value?.body?.Id)
      return new ValidatedOutput(false, "").pushError(this.ERRORSTRINGS.FAILED_COMMIT(id))

    return new ValidatedOutput(true, api_request.value.body.Id)
  }

  jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput<undefined>(true, undefined)

    ids.map((id:string) => {
      const api_request = this.curl.post({
          "url": `/containers/${id}/stop`,
          "body": {t: 10}
        })
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
      const api_result = this.curl.delete({
        "url": `/containers/${id}`,
      })
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
    const api_request = this.curl.post({
      "url": "/volumes/create",
      "encoding": "json",
      "body": data
    })

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
      const api_result = this.curl.delete({
        "url": `/volumes/${id}`,
      })
      // -- check request status -------------------------------------------------
      result.absorb(api_result)
      if(!this.validAPIResponse(api_result, 204))
        result.pushError(this.ERRORSTRINGS.FAILED_DELETE(id))
    })

    return result
  }

  emptyStackConfiguration()
  {
    return new DockerStackConfiguration()
  }

  emptyJobConfiguration(stack_configuration?: DockerStackConfiguration)
  {
    return new DockerJobConfiguration(stack_configuration || this.emptyStackConfiguration())
  }

  emptyExecConfiguration(options?:ExecConstrutorOptions)
  {
    return new DockerExecConfiguration(options)
  }

  private validAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!response.success) return false
    if(code !== undefined && response.value.header.code !== code) return false
    return true
  }

  private validJSONAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!this.validAPIResponse(response)) return false
    if(response.value.header.type !== "application/json") return false
    return true
  }

}
