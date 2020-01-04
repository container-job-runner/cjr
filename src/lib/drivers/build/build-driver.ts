import {ContainerDriver} from "../container-driver"

export abstract class BuildDriver extends ContainerDriver
{
  abstract validate(stack_path: string, overloaded_config_paths: array<string>): ValidatedOutput;
  abstract build(stack_path: string, overloaded_config_paths: array<string>, nocache:boolean = false): ValidatedOutput;
  abstract isBuilt(stack_path: string): boolean;
  abstract loadConfiguration(stack_path: string, overloaded_config_paths: array<string>): ValidatedOutput;
  abstract removeImage(stack_path: string): ValidatedOutput;
}
