import {ContainerDriver} from "./container-driver"
import {ValidatedOutput} from "../../validated-output"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export abstract class BuildDriver extends ContainerDriver
{
  abstract validate(stack_path: string, overloaded_config_paths: Array<string>): ValidatedOutput;
  abstract build(stack_path: string, overloaded_config_paths: Array<string>, nocache?:boolean): ValidatedOutput;
  abstract isBuilt(stack_path: string): boolean;
  abstract loadConfiguration(stack_path: string, overloaded_config_paths: Array<string>): ValidatedOutput;
  abstract removeImage(stack_path: string): ValidatedOutput;
  abstract copy(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput;
}
