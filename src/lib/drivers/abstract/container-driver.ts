import * as path from 'path'
import {ShellCMD} from "../../shellcmd"

export class ContainerDriver
{

  private shell: ShellCMD
  private tag: string

  constructor(scmd: ShellCMD, tag: string)
  {
    this.shell = scmd;
    this.tag = tag;
  }

  stackName(stack_path: string)
  {
      const re  = new RegExp(`${path.sep}$`) // remove any trailing separators that lead to empty name
      return stack_path.replace(re, "").split(path.sep).pop()
  }

  imageName(stack_path: string)
  {
    return `${this.stackName(stack_path)}:${this.tag}`
  }

}
