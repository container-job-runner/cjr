
import {ValidatedOutput} from "../../validated-output"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"
import {ShellCommand} from "../../shell-command"
import {BuildDriver, Dictionary} from '../abstract/build-driver'
import {DockerStackConfiguration} from '../../config/stacks/docker/docker-stack-configuration'

export class DockerSocketBuildDriver extends BuildDriver
{
  protected socket:string

  constructor(shell: ShellCommand, options: {tag: string, socket: string})
  {
    super(shell, options.tag)
    this.socket = options.socket
  }

  validate(stack_path: string): ValidatedOutput<Dictionary>
  {
    return new ValidatedOutput(true, {})
  }

  build(stack_path: string, configuration: StackConfiguration, options?: Dictionary): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  isBuilt(stack_path: string, configuration: StackConfiguration): boolean
  {
    return true
  }

  loadConfiguration(stack_path: string, overloaded_config_paths: Array<string>): ValidatedOutput<DockerStackConfiguration>
  {
    return new ValidatedOutput(true, this.emptyConfiguration())
  }

  removeImage(stack_path: string, configuration?: StackConfiguration): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  copy(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  copyConfig(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput<undefined>
  {
    return new ValidatedOutput(true, undefined)
  }

  emptyConfiguration()
  {
    return new DockerStackConfiguration()
  }

  imageName(stack_path: string, prefix: string="") // Docker only accepts lowercase image names
  {
    return super.imageName(stack_path, prefix).toLowerCase()
  }

}
