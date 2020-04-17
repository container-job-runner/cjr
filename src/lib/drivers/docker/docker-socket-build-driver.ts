
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

  validate(stack_path: string): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  build(stack_path: string, configuration: StackConfiguration, options?: Dictionary): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  isBuilt(stack_path: string, configuration: StackConfiguration): boolean
  {
    return true
  }

  loadConfiguration(stack_path: string, overloaded_config_paths: Array<string>): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  removeImage(stack_path: string, configuration?: StackConfiguration): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  copy(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput
  {
    return new ValidatedOutput(true)
  }

  copyConfig(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput
  {
    return new ValidatedOutput(true)
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
