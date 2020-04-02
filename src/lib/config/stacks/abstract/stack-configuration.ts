// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import {JSTools} from '../../../js-tools'
import {YMLFile} from '../../../fileio/yml-file'
import {ValidatedOutput} from '../../../validated-output'
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

  getRawObject()
  {
    return JSTools.rCopy(this.raw_object)
  }

  merge (other: StackConfiguration) {
    JSTools.rMerge(this.raw_object, other.raw_object)
  }

  loadFromFile(file_path: string, mode: 'overwrite'|'merge'='overwrite')
  {
    // -- exit if no hostRoot is specified -------------------------------------
    if(!file_path) return new ValidatedOutput(true);
    // -- exit if no settings file exists --------------------------------------
    if(!fs.existsSync(file_path)) return new ValidatedOutput(false);
    // -- exit if settings file is invalid -------------------------------------
    const read_result = this.yml_file.validatedRead(file_path)
    if(!read_result.success)
      return read_result
    else
      return this.setRawObject(read_result.data, path.dirname(file_path))
  }

  writeToFile(file_path: string)
  {
    return this.yml_file.validatedWrite(file_path, this.raw_object)
  }

  abstract buildHash(): string;  // unique id to identify configuration for building
  abstract runHash(): string;  // unique id to identify configuration for running
  // interactive components that may be called by CLI to modify existing configuration
  abstract setCommand(value: string): void;
  abstract setEntrypoint(value: string): void;
  abstract setWorkingDir(value: string): void;
  abstract setSyncronous(value: boolean): void;
  abstract setRemoveOnExit(value: boolean): void;
  abstract setRsyncUploadSettings(value: {include: string, exclude: string}): void;
  abstract setRsyncDownloadSettings(value: {include: string, exclude: string}): void;
  abstract addBind(hostPath: string, containerPath: string, options?:Dictionary): boolean;
  abstract addVolume(volumeName: string, containerPath: string): boolean;
  abstract addPort(hostPort: number, containerPort: number): boolean;
  abstract addLabel(field: string, value: string): boolean;
  abstract addFlag(field: string, value: string): boolean;
  abstract removeFlag(field: string): boolean;
  abstract addRunEnvironmentVariable(name: string, value: string): boolean;
  // access functions
  abstract getCommand(): string;
  abstract getContainerRoot() : string;
  abstract getRsyncUploadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getRsyncDownloadSettings(filter_nonexisting: boolean): {include: string, exclude: string}
  abstract getFlags(): Dictionary;
  // output objects for run-drivers or build-drivers
  abstract runObject() : Dictionary;
  abstract buildObject() : Dictionary;
  // misc Functions
  abstract removeExternalBinds(parent_path: string): ValidatedOutput;
  abstract validate(value: Dictionary): ValidatedOutput;
}
