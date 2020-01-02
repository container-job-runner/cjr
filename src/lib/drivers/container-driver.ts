import {ShellCMD} from "../../shellcmd"
import * as path from 'path'

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

  // newId()
  // {
  //   const letters = ["a", "b", "c", "d", "e", "f", "g", "h",
  //   "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s",
  //   "t", "u", "v", "w", "x", "y", "z"]
  //   const header_length = 4
  //   const randInt = ceiling => Math.floor(Math.random() * ceiling); // random integer from [0, ceiling)
  //   const header = Array(letter_length).map(e => letters[randInt(letter.length)]).join("")
  //   const footer = new Date().getTime();
  //   while(new Date().getTime() <= footer) {}
  //   return header + footer;
  // }

}
