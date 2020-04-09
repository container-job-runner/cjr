import {ContainerDriver} from "./container-driver"
import {ValidatedOutput} from "../../validated-output"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export abstract class BuildDriver extends ContainerDriver
{
  abstract validate(stack_path: string): ValidatedOutput;
  abstract build(stack_path: string, configuration: StackConfiguration, options?: Dictionary): ValidatedOutput;
  abstract isBuilt(stack_path: string, configuration: StackConfiguration): boolean;
  abstract loadConfiguration(stack_path: string, overloaded_config_paths: Array<string>): ValidatedOutput;
  abstract removeImage(stack_path: string, configuration?: StackConfiguration): ValidatedOutput;
  abstract copy(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput;       // copies stack files and configuration to new folder
  abstract copyConfig(stack_path: string, copy_path: string, configuration?: StackConfiguration): ValidatedOutput; // copies stack configuration to new folder
}
