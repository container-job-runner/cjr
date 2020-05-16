export type ExecConstructorOptions = {
  command?:  Array<string>,
  synchronous?: boolean,
  working_directory?: string
}

export class ExecConfiguration
{
  command: Array<string>;
  synchronous: boolean;
  working_directory: string;

  constructor(props?: ExecConstructorOptions)
  {
    this.command = props?.command || [];
    this.synchronous = (props?.synchronous === undefined) ? true : props?.synchronous;
    this.working_directory = props?.working_directory || ""
  }

}
