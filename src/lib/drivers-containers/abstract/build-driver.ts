import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { Dictionary } from '../../constants'
import { ShellCommand } from '../../shell-command'
import { SshShellCommand } from '../../ssh-shell-command'

// - types ---------------------------------------------------------------------

export abstract class BuildDriver
{
  protected shell: ShellCommand|SshShellCommand

  constructor(shell: ShellCommand|SshShellCommand)
  {
    this.shell = shell;
  }

  abstract build(configuration: StackConfiguration<any>, stdio:"inherit"|"pipe", options?: Dictionary): ValidatedOutput<string>;
  abstract isBuilt(configuration: StackConfiguration<any>): boolean;
  abstract removeImage(configuration: StackConfiguration<any>): ValidatedOutput<undefined>;
  abstract removeAllImages(stack_path:string): ValidatedOutput<undefined>;
  abstract tagImage(configuration: StackConfiguration<any>, name: string) : ValidatedOutput<undefined>
  abstract pushImage(configuration: StackConfiguration<any>, options: Dictionary, stdio:"inherit"|"pipe") : ValidatedOutput<undefined>

}
