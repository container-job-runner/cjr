// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import {JSTools} from '../../js-tools'
import {ValidatedOutput} from '../../validated-output'
type Dictionary = {[key: string]: any}

export abstract class Configuration
{
  protected raw_object: Dictionary = {}

  setRawObject(value: Dictionary, parent_path: string) {
    const result = this.validate(value)
    if(result.success) this.raw_object = value
    return result
  }

  merge (other: Configuration) {
      JSTools.rMerge(this.raw_object, other.raw_object)
  }

  // interactive components that may be called by CLI to modify existing configuration
  abstract setWorkingDir(value: string): void;
  abstract getHostRoot(): string | undefined;
  abstract getContainerRoot() : string | undefined;
  abstract getResultPaths() : Array<string> | undefined;
  abstract addBind(hostPath: string, containerPath: string): boolean;
  abstract addPort(hostPort: number, containerPort: number): boolean;
  abstract addRunEnvironmentVariable(name: string, value: string): boolean;
  abstract bundle(stack_path: string): ValidatedOutput
  // output objects for run-drivers or build-drivers
  abstract runObject() : Dictionary;
  abstract buildObject() : Dictionary;
  // local Functions
  abstract validate(value: Dictionary): ValidatedOutput;
}
