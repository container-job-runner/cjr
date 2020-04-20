// ===========================================================================
// Docker-Socket-Run-Driver: Controls Docker Socket For Running containers
// ===========================================================================

import * as chalk from 'chalk'
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { RunDriver, Dictionary } from '../abstract/run-driver'
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

  jobInfo(stack_paths: Array<string>, job_states: Array<string> = []) : Array<Dictionary>
  {
    var result = this.curl.get({
      "url": "/containers/json",
      "data": {
        all: true,
        filters: JSON.stringify({"label": [`runner=${cli_name}`]})
      }
    })

    if(!this.validAPIResponse(result, 200))
      return []

    // standardize output. NOTE: Add comment to docker-socket-build-driver
    return result?.data?.response?.map( (cntr: Dictionary) => {
      return {
        id:      cntr.Id,
        names:   cntr.Names,
        command: cntr.Command,
        status:  cntr.Status,                                     // rename status string in classical driver
        state:   cntr.State?.toLowerCase(),                       // note rename this to state also in classical driver
        stack:   cntr.Labels?.stack || "",
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
  }

  jobStart(stack_path: string, configuration: StackConfiguration, callbacks:Dictionary): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  jobLog(id: string) : ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  jobAttach(id: string) : ValidatedOutput
  {
    return new ValidatedOutput(
      true,
      this.shell.exec(`${this.base_command} attach`, {}, [id])
    )
  }

  jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary, mode:"print"|"output"|"json") : ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  jobToImage(id: string, image_name: string): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  jobStop(ids: Array<string>) : ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  jobDelete(ids: Array<string>) : ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  volumeCreate(options:Dictionary): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  volumeDelete(options:Dictionary): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  emptyConfiguration()
  {
    return new DockerStackConfiguration()
  }

  private validAPIResponse(response: ValidatedOutput, code?:number) : boolean
  {
    if(!response.success) return false
    if(response.data?.header?.type !== "application/json") return false
    if(code !== undefined && response.data?.header?.code !== code) return false
    return true
  }

}
