import {ValidatedOutput} from "../../validated-output"
import {BuildDriver} from "../../drivers/abstract/build-driver"
type Dictionary = {[key: string]: any}

export abstract class RemoteDriver
{
  protected config: Dictionary // used to store this.config from OCLIF
  protected output_flags: Dictionary

  constructor(verbose:boolean, silent:boolean, oclif_config: Dictionary)
  {
    this.config = oclif_config
    this.output_flags = {verbose: verbose, silent: silent}
  }

  abstract jobAttach(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobCopy(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobDelete(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobList(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobLog(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobShell(resource: Dictionary, builder: BuildDriver, stack_path: string, overloaded_config_paths: Array<string>, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobStart(resource: Dictionary, builder: BuildDriver, stack_path: string, overloaded_config_paths: Array<string>, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobStop(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract async promptUserForJobId(resource: Dictionary, interactive: boolean): Promise<string>

}
