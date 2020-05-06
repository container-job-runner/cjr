import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { Dictionary } from '../../constants'
import { ShellCommand } from '../../shell-command'

// - types ---------------------------------------------------------------------

export abstract class BuildDriver
{
  protected shell: ShellCommand

  constructor(shell: ShellCommand)
  {
    this.shell = shell;
  }

  abstract build(configuration: StackConfiguration<any>, stdio:"inherit"|"pipe", options?: Dictionary): ValidatedOutput<undefined>;
  abstract isBuilt(configuration: StackConfiguration<any>): boolean;
  abstract removeImage(configuration: StackConfiguration<any>): ValidatedOutput<undefined>;
  abstract removeAllImages(stack_path:string): ValidatedOutput<undefined>;
}
