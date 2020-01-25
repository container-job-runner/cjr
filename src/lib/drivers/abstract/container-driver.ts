import * as path from 'path'
import {ShellCMD} from "../../shellcmd"

export class ContainerDriver
{

  protected shell: ShellCMD
  protected tag: string

  constructor(scmd: ShellCMD, tag: string)
  {
    this.shell = scmd;
    this.tag = tag;
  }

  stackName(stack_path: string)
  {
    return path.basename(stack_path)
  }

  imageName(stack_path: string)
  {
    return `${this.stackName(stack_path)}:${this.tag}`
  }

}
