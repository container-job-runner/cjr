
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { BuildDriver } from '../abstract/build-driver'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { Dictionary } from '../../constants'

export class DockerSocketBuildDriver extends BuildDriver
{
  protected socket:string

  constructor(shell: ShellCommand, options: {socket: string})
  {
    super(shell)
    this.socket = options.socket
  }

  build(configuration: DockerStackConfiguration, options?: Dictionary): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  isBuilt(configuration: StackConfiguration<any>): boolean
  {
    return false
  }

  removeImage(configuration: DockerStackConfiguration): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  removeAllImages(stack_path: string): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

}
