export type ExecConstrutorOptions = {
  command?:  Array<string>,
  synchronous?: boolean,
  working_directory?: string,
  interactive?: boolean
}

export class ExecConfiguration
{
  command: Array<string>;
  synchronous: boolean;
  working_directory: string;
  interactive: boolean;

  constructor(props?: ExecConstrutorOptions)
  {
    this.command = props?.command || [];
    this.synchronous = (props?.synchronous === undefined) ? true : props?.synchronous;
    this.working_directory = props?.working_directory || ""
    this.interactive = (props?.interactive === undefined) ? true : props.interactive;
  }

}
