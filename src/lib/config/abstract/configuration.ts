// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

import {JSTools} from '../../js-tools'

export abstract class Configuration
{
  private raw_object: object = {}

  setRawObject(value: object, parent_path: string) {
    const result = this.validate(value)
    if(result.success) this.raw_object = value
    return result
  }

  merge (other: Configuration) {
      JSTools.rMerge(this.raw_object, other.raw_object)
  }

  // interactive components that may be called by CLI to modify existing configuration
  abstract setWorkingDir(value: string): void;
  abstract setName(value: string): void;
  abstract getHostRoot(): string | undefined;
  abstract getContainerRoot() : string | undefined;
  abstract getResultPaths() : array<string> | undefined;
  abstract addBind(hostPath: string, containerPath: string): boolean;
  abstract addPort(hostPort: integer, containerPort: integer): boolean;
  abstract addRunEnvironmentVariable(name: string, value: string): boolean;
  abstract bundle(): Configuration
  // output objects for run-drivers or build-drivers
  abstract runObject() : object;
  abstract buildObject() : object;
  // local Functions
  abstract validate(value: object): ValidatedOutput;
}
