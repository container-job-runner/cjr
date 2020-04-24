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

export class DockerSocketRunDriver extends RunDriver
{
  protected curl: Curl
  protected base_command: string = "docker"

  protected ERRORSTRINGS = {
    BAD_RESPONSE: chalk`{bold Bad API Response.} Is Docker running?`,
    EMPTY_CREATE_ID: chalk`{bold Unable to create container.}`,
    FAILED_CREATE_VOLUME: chalk`{bold Unable to create volume.}`
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

    // -- filter jobs and return -----------------------------------------------
    return new ValidatedOutput(true, this.jobFilter(job_info, filter))
  }

  jobStart(stack_path: string, configuration: StackConfiguration, stdio:"inherit"|"pipe"): ValidatedOutput<NewJobInfo>
  {
    // // -- create container ---------------------------------------------------
    // var result = this.curl.post({
    //   "url": "/containers/create",
    //   "unix-socket": this.socket,
    //   "encoding": "json",
    //   "data": configuration.createObject(),
    // })

    // return (new ValidatedOutput(false)).pushError(this.ERRORSTRINGS.BAD_RESPONSE)
    // if(!result.success) return result
    // if(!result.value?.['id']) return new ValidatedOutput(false).pushError(this.ERRORSTRINGS.EMPTY_CREATE_ID)

    // const container_id = result.value['id'];
    // if(callbacks?.postCreate) callbacks.postCreate(container_id)
    // // -- run container --------------------------------------------------------
    // if(configuration.syncronous()) // user docker command
    // {
    //   result = this.shell.exec(
    //     `${this.base_command} start`,
    //     {attach: {}, interactive: {}},
    //     [container_id]
    //   )
    //   if(!result.success) return result
    // }
    // else // use docker api
    // {
    //   var result = this.curl.post({
    //     "url": "/containers/create",
    //     "encoding": "json",
    //     "data": configuration.createObject(),
    //   })
    // }
    // if(!result.success) return result
    // if(callbacks?.postExec) callbacks.postExec(result)




    // const command = `${this.base_command} start`;
    // const args: Array<string> = [container_id]
    // const flags = (!job_options.detached) ? {attach: {}, interactive: {}} : {}
    // const shell_options = (!job_options.detached) ? {stdio: "inherit"} : {stdio: "pipe"}
    // result = this.shell.exec(command, flags, args, shell_options)
    // if(!result.success) return result
    // if(callbacks?.postExec) callbacks.postExec(result)
    // return result



    // return result



   return new ValidatedOutput(true, {id:"","exit-code": 0,output:""})
  }

  jobLog(id: string, lines: string="all") : ValidatedOutput<string>
  {
    // -- make api request -----------------------------------------------------
    var api_result = this.curl.get({
      "url": `/containers/${id}/logs`,
      "data": {
        tail: lines,
        stdout: true,
        stderr: true
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
    return new ValidatedOutput(true, undefined)
  }

  jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  volumeCreate(options:Dictionary): ValidatedOutput<string>
  {
    return new ValidatedOutput(true, "")
  }

  volumeDelete(options:Dictionary): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  emptyConfiguration()
  {
    return new DockerStackConfiguration()
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
