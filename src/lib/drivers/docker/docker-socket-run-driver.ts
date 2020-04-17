// ===========================================================================
// Docker-Socket-Run-Driver: Controls Docker Socket For Running containers
// ===========================================================================

import {ValidatedOutput} from "../../validated-output"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"
import {ShellCommand} from "../../shell-command"
import {RunDriver, Dictionary} from '../abstract/run-driver'
import {DockerStackConfiguration} from '../../config/stacks/docker/docker-stack-configuration'

export class DockerSocketRunDriver extends RunDriver
{
  protected socket: string

  constructor(shell: ShellCommand, options: {tag: string, selinux: boolean, socket: string})
  {
    super(shell, options.tag)
    this.socket = options.socket
  }

  jobInfo(stack_paths: Array<string>, job_states: Array<string> = []) : Array<Dictionary>
  {
    return []
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
    return new ValidatedOutput(true)
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

}
