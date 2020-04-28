import * as crypto from 'crypto'
import * as path from 'path'
import {ShellCommand} from "../../shell-command"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"

export abstract class ContainerDriver
{

  protected shell: ShellCommand
  protected tag: string

  constructor(shell: ShellCommand, tag: string)
  {
    this.shell = shell;
    this.tag = tag;
  }

  stackName(stack_path: string)
  {
    return path.basename(stack_path).split(':').shift() || ""
  }

  imageName(stack_path: string, prefix: string="")
  {
    if(path.isAbsolute(stack_path)) { // default behavior for local files
      const path_hash = crypto.createHash('md5').update(path.dirname(stack_path)).digest('hex')
      return `${(prefix) ? `${prefix}-` : ''}${path_hash}-${this.stackName(stack_path)}:${this.tag}`
    }
    return stack_path // default behavior for remote images
  }

  abstract emptyStackConfiguration(): StackConfiguration

}
