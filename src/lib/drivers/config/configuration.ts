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
    if(result.success) {
        this.raw_object = value
        if(parent_path) this.replaceRelativePaths(parent_path)
    }
    return result
  }

  merge (other: Configuration) {
      JSTools.rMerge(this.raw_object, other.raw_object)
  }

  // minimum abstractions required by build, ssh and run for all configurations

  abstract setWorkingDir(value: string): void;
  abstract setName(value: string): void;
  abstract getHostRoot(): string | undefined;
  abstract getContainerRoot() : string | undefined;
  abstract getResultPaths() : array<string> | undefined;
  abstract addBind(hostRoot: string, containerRoot: string): boolean;
  abstract addPort(hostRoot: string, containerRoot: string): boolean;
  abstract runObject() : object;
  abstract buildObject() : object;
  abstract validate(value: object): ValidatedOutput;
  abstract private replaceRelativePaths(config_path: string): void;    // replaces relative paths with absolute paths

}
