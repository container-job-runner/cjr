// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import { ValidatedOutput } from '../../../validated-output'
import { Dictionary } from '../../../constants'
import { SshShellCommand } from '../../../ssh-shell-command'
import { ShellCommand } from '../../../shell-command'

export abstract class StackConfiguration<T>
{
  stack_path: string|undefined
  stack_name: string|undefined
  abstract config: T

  //COPY returns new StackConfigurations with deep copies of all parameters
  abstract copy() : StackConfiguration<T>
  //LOAD loads stack configuration from a directory containing requisite stack data
  abstract load(stack_path: string, overloaded_config_paths: Array<string>, shell?:ShellCommand|SshShellCommand) : ValidatedOutput<undefined>
  // loadConfiguration merges configuration from yml file with current stack configuration
  abstract mergeConfigurations(config_path: Array<string>, shell?:ShellCommand|SshShellCommand) : ValidatedOutput<undefined>
  //SAVE saves configuration into stack directory
  abstract save(stack_path: string, options?: Dictionary) : ValidatedOutput<undefined> | ValidatedOutput<Error>

  // == modifiers ==============================================================
  abstract setImage(value: string): void
  abstract setBuildAuth(auth: Dictionary) : void
  abstract setTag(value: string): void
  abstract setEntrypoint(value: Array<string>): void;
  abstract setRsyncUploadSettings(value: {include: string|undefined, exclude: string|undefined}): void;
  abstract setRsyncDownloadSettings(value: {include: string|undefined, exclude: string|undefined}): void;
  abstract setSnapshotOptions(options: Dictionary): void
  abstract removeEntrypoint() : void
  abstract setContainerRoot(value: string) : void
  // ----> mount modifiers
  abstract addBind(hostPath: string, containerPath: string, options?:Dictionary): boolean;
  abstract addVolume(volumeName: string, containerPath: string): boolean;
  abstract removeBind(hostPath: string): ValidatedOutput<undefined>;
  abstract removeVolume(parent_path: string): ValidatedOutput<undefined>;
  abstract removeAllVolumes() : ValidatedOutput<undefined>;
  abstract removeLocalBinds() : ValidatedOutput<undefined>;
  abstract removeExternalBinds(parent_path: string): ValidatedOutput<undefined>; // note: this function should be removed once updated remote code is finished
  abstract removeBuildAuth() : boolean
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
  abstract getTag(): string;
  abstract getEntrypoint() : Array<string> | undefined;
  abstract getName(): string;
  abstract getBuildAuth() : Dictionary | undefined
  abstract getSnapshotOptions(): undefined | Dictionary
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

  // == remote functions =======================================================
  
  // maps bind host paths (stack_path -> maps['stack_path'](stack_path), bind_paths -> maps['bind-paths'](bind_path)
  abstract mapPaths(map: {"stack-path": (p:string) => string, "bind-paths": (p:string) => string}): ValidatedOutput<undefined>
  abstract getBindMountPaths(remote_only: boolean) : Array<string> // returns paths of binds on localhost. If remote_only=true, then only select those that will be uploaded remotely
}
