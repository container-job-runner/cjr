// ===========================================================================
// Docker-Socket-Run-Driver: Controls Docker Socket For Running containers
// ===========================================================================

import * as chalk from 'chalk'
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { RunDriver, Dictionary, JobState, JobInfo, JobInfoFilter, NewJobInfo } from '../abstract/run-driver'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { Curl } from '../../curl'
import { cli_name } from '../../constants'

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
    // const filters:Dictionary = {"label": [`runner=${cli_name}`]}
    // if(job_states.length > 0)  filters['status'] = job_states

    // const raw_info:Array<Dictionary> = []
    // stack_paths.map((stack_path: string) => {
    //   var result = this.curl.get({
    //     "url": "/containers/json",
    //     "data": {
    //       all: true,
    //       filters: JSON.stringify({"label": [`runner=${cli_name}`]})
    //     }
    // })

    // })

    return new ValidatedOutput(true, [])

    // var result = this.curl.get({
    //   "url": "/containers/json",
    //   "data": {
    //     all: true,
    //     filters: JSON.stringify({"label": [`runner=${cli_name}`]})
    //   }
    // })

    // if(!this.validAPIResponse(result, 200))
    //   return []

    // // standardize output. NOTE: Add comment to docker-socket-build-driver
    // return result?.data?.body?.map( (cntr: Dictionary) => {
    //   return {
    //     id:      cntr.Id,
    //     names:   cntr.Names,
    //     command: cntr.Command,
    //     status:  cntr.Status,                                     // rename status string in classical driver
    //     state:   cntr.State?.toLowerCase(),                       // note rename this to state also in classical driver
    //     stack:   cntr.Labels?.stack || "",
    //     labels:  cntr.Labels || {},
    //     ports:   cntr.Ports?.map((prt:Dictionary) => {
    //       return {
    //         ip: prt.IP,
    //         containerPort: prt.PrivatePort,
    //         hostPort: prt.PublicPort
    //       }
    //     }) || [],
    //   }
    // }) || [];
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
    // if(!result.data?.['id']) return new ValidatedOutput(false).pushError(this.ERRORSTRINGS.EMPTY_CREATE_ID)

    // const container_id = result.data['id'];
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

  jobLog(id: string) : ValidatedOutput<string>
  {
    var result = this.curl.get({
      "url": `/containers/${id}/json`,
      "data": {all: true, filter: [`label=runner=${cli_name}`]}
    })
    //return result
    return new ValidatedOutput(true, "")
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

  private validAPIResponse(response: ValidatedOutput<any>, code?:number) : boolean
  {
    if(!response.success) return false
    if(response.data?.header?.type !== "application/json") return false
    if(code !== undefined && response.data?.header?.code !== code) return false
    return true
  }

}
