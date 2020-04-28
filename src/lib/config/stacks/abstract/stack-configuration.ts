// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { JSTools } from '../../../js-tools'
import { YMLFile } from '../../../fileio/yml-file'
import { ValidatedOutput } from '../../../validated-output'
type Dictionary = {[key: string]: any}

export abstract class StackConfiguration
{
  protected raw_object: Dictionary = {}
  protected abstract yml_file:YMLFile

  setRawObject(value: Dictionary, parent_path: string) {
    const result = this.validate(value)
    if(result.success) this.raw_object = value
    return result
  }

  abstract validate(value: Dictionary): ValidatedOutput<undefined>;

  getRawObject()
  {
    return JSTools.rCopy(this.raw_object)
  }

  merge (other: StackConfiguration) {
    JSTools.rMerge(this.raw_object, other.raw_object)
  }

  loadFromFile(file_path: string, mode: 'overwrite'|'merge'='overwrite') : ValidatedOutput<undefined>
  {
    // -- exit if no hostRoot is specified -------------------------------------
    if(!file_path) return new ValidatedOutput(true, undefined);
    // -- exit if no settings file exists --------------------------------------
    if(!fs.existsSync(file_path)) return new ValidatedOutput(false, undefined);
    // -- exit if settings file is invalid -------------------------------------
    const read_result = this.yml_file.validatedRead(file_path)
    if(!read_result.success)
      return read_result
    else
      return this.setRawObject(read_result.value, path.dirname(file_path))
  }

  writeToFile(file_path: string): ValidatedOutput<undefined>|ValidatedOutput<Error>
  {
    return this.yml_file.validatedWrite(file_path, this.raw_object)
  }

  abstract buildHash(): string;  // unique id to identify configuration for building
  abstract buildObject() : Dictionary;

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
  abstract setMemory(value: number, units:"GB"|"MB"|"B") : void
  abstract setSwapMemory(value: number, units:"GB"|"MB"|"B") : void
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
  abstract getContainerRoot() : string;
  abstract getRsyncUploadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getRsyncDownloadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getFlags(): Dictionary;
}
