import { StackConfiguration } from "../stacks/abstract/stack-configuration";

export class JobConfiguration<T extends StackConfiguration>
{
  stack_configuration: T;
  command: Array<string>;
  synchronous: boolean;
  remove_on_exit: boolean;
  working_directory: string
  labels: {[key:string] : string};

  constructor(environment: T, props?: {command:  Array<string>, synchronous: boolean, remove_on_exit: boolean, working_directory: string, labels: {[key:string] : string}})
  {
    this.stack_configuration = environment;
    this.command = props?.command || [];
    this.synchronous = props?.synchronous || true;
    this.remove_on_exit = props?.remove_on_exit || false;
    this.working_directory = props?.working_directory || environment.getContainerRoot()
    this.labels = props?.labels || {}
  }

  addLabel(field: string, value: string)
  {
    if(!this.labels) this.labels = {}
    this.labels[field] = value
    return true;
  }

  removeLabel(field: string)
  {
    delete this.labels[field]
  }

}
