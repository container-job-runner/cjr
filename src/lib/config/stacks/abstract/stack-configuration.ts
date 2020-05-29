// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import { ValidatedOutput } from '../../../validated-output'
import { Dictionary } from '../../../constants'
import { SshShellCommand } from '../../../remote/ssh-shell-command'
import { ShellCommand } from '../../../shell-command'

export abstract class StackConfiguration<T>
{
  stack_path: string|undefined
  abstract config: T

  //LOAD loads stack configuration from a directory containing requisite stack data
  abstract load(stack_path: string, overloaded_config_paths: Array<string>) : ValidatedOutput<undefined>
  //SAVE saves configuration into stack directory
  abstract save(stack_path: string, options?: Dictionary) : ValidatedOutput<undefined> | ValidatedOutput<Error>

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
  abstract addEnvironmentVariable(name: string, value: string, evaluate?: boolean, shell?:ShellCommand|SshShellCommand): boolean;
  abstract removeEnvironmentVariable(name: string): boolean;
  // ----> misc flag modifiers
  abstract addFlag(field: string, value: string): boolean;
  abstract removeFlag(field: string): boolean;
  // ----> build Args
  abstract addBuildArg(name: string, value: string, evaluate?: boolean, shell?:ShellCommand|SshShellCommand): boolean;
  abstract removeBuildArg(name: string, value: string): boolean;
  // ----> build flags
  abstract addBuildFlag(flag: string, value?: string): boolean;
  abstract removeBuildFlag(flag: string): boolean;

  // == access functions =======================================================
  abstract getImage(): string;
  abstract getEntrypoint() : Array<string> | undefined;
  abstract getName(): string;

  abstract getContainerRoot() : string;
  abstract getRsyncUploadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getRsyncDownloadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getFlag(key: string) : string | undefined
  abstract getFlags(): {[key:string] : string};
  abstract getBuildArg(key: string) : string | undefined
  abstract getBuildArgs(): {[key:string] : string}
  abstract getEnvironmentVar(key: string) : string | undefined
  abstract getEnvironmentVars(): {[key:string] : string}
  abstract getMounts(): Array<Dictionary>
  abstract getPorts(): Array<Dictionary>
}
