// ===========================================================================
// Docker-Socket-Run-Driver: Controls Docker Socket For Running containers
// ===========================================================================

import * as chalk from 'chalk'
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { RunDriver, Dictionary, JobState, JobInfo, JobInfoFilter, NewJobInfo } from '../abstract/run-driver'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { Curl, RequestOutput } from '../../curl'
import { cli_name, stack_path_label } from '../../constants'
import { spawn } from 'child_process'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'

export class DockerSocketRunDriver extends RunDriver
{
  protected curl: Curl
  protected base_command: string = "docker"
  protected labels = {"invisible-on-stop": "IOS"}

  protected ERRORSTRINGS = {
    BAD_RESPONSE: chalk`{bold Bad API Response.} Is Docker running?`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`,
    FAILED_CREATE_VOLUME: chalk`{bold Unable to create volume.}`,
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
      "data": {
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
      "data": configuration.apiContainerCreateObject(),
    })

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_request, 200) || !api_request.value.body?.Id)
      return new ValidatedOutput(false, failure_response)

    const id:string = api_request.value.body.Id;
    // -- run job using docker command (allows for sync and remove) ------------
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
      "data": {
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

  jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>
  {
    return new ValidatedOutput(true, {id:"","exit-code": 0,output:""})
  }

  jobToImage(id: string, image_name: string): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput<undefined>(true, undefined)

    ids.map((id:string) => {
      const api_request = this.curl.post({
          "url": `/containers/${id}/stop`,
          "data": {t: 10}
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
      "data": data
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
