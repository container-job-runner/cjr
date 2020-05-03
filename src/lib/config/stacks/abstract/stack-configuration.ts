// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import { ValidatedOutput } from '../../../validated-output'
import { Dictionary } from '../../../constants'

export abstract class StackConfiguration<T>
{
  stack_path: string|undefined
  abstract config: T
  abstract load(stack_path: string, overloaded_config_paths: Array<string>) : ValidatedOutput<undefined>
  abstract readConfigFromFile(path: string) : ValidatedOutput<undefined>
  abstract writeConfigToFile(path: string) : ValidatedOutput<undefined> | ValidatedOutput<Error>

  // == modifiers ==============================================================
  abstract setImage(value: string): void
  abstract setEntrypoint(value: Array<string>): void;
  abstract setRsyncUploadSettings(value: {include: string, exclude: string}): void;
  abstract setRsyncDownloadSettings(value: {include: string, exclude: string}): void;
  // ----> mount modifiers
  abstract addBind(hostPath: string, containerPath: string, options?:Dictionary): boolean;
  abstract addVolume(volumeName: string, containerPath: string): boolean;
  abstract removeBind(hostPath: string): ValidatedOutput<undefined>;
  abstract removeVolume(parent_path: string): ValidatedOutput<undefined>;
  abstract removeExternalBinds(parent_path: string): ValidatedOutput<undefined>;
  // ----> resource modifiers
  abstract setMemory(value: number, units:"GB"|"MB"|"KB"|"B") : void
  abstract setSwapMemory(value: number, units:"GB"|"MB"|"KB"|"B") : void
  abstract setCpu(value: number) : void
  // ----> port modifiers
  abstract addPort(hostPort: number, containerPort: number, address?:string): boolean;
  abstract removePort(hostPort: number): ValidatedOutput<undefined>;
  // ----> environment variables
  abstract addEnvironmentVariable(name: string, value: string, dynamic?: boolean): boolean;
  abstract removeEnvironmentVariable(name: string): boolean;
  // ----> misc flag modifiers
  abstract addFlag(field: string, value: string): boolean;
  abstract removeFlag(field: string): boolean;
  // ----> build Args
  abstract addBuildArg(name: string, value: string, evaluate?: boolean): boolean;
  abstract removeBuildArg(name: string, value: string, evaluate?: boolean): boolean;

  // == access functions =======================================================
  abstract getImage(): string;
  abstract getEntrypoint() : Array<string> | undefined;
  abstract getName(): string;

  abstract getContainerRoot() : string;
  abstract getRsyncUploadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getRsyncDownloadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getFlags(): Dictionary;
}
