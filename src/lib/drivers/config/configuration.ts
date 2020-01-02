// ===========================================================================
// Configuration: An abstract class that stores the configuration for a stack.
// It encapsulates the most general features required by all configurations
// ===========================================================================

export abstract class Configuration
{
  private raw_object: object

  setRawObject(value: object)
  {
    const result = this.validate(value)
    if(result.success) this.raw_object = value
    return result
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

}
