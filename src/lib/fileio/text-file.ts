import * as fs from 'fs'
import * as path from 'path'
import {ValidatedOutput} from "../validated-output"

export class TextFile
{
  private parent_dir: string // files will be created relative to the parent_dir
  private extension: string = "txt"
  private validator = (x) => x

  constructor(parent_dir: string = "", validator = undefined)
  {
    this.parent_dir = parent_dir
    this.validator = validator
  }

  write(name:string, data_str:string)
  {
    fs.writeFileSync(this.filePath(name), data_str)
  }

  read(name:string)
  {

    try {
      return new ValidatedOutput(
        true,
        fs.readFileSync(this.filePath(name),'utf8')
      )
    }
    catch(e) {
      return ValidatedOutput(false, e)
    }
  }

  validatedRead(name:string)
  {
    var result = this.read(name)
    if(result.success){
      return this?.validator(result.data)
    } else {
        return result
    }
  }

  delete(name:string)
  {
    fs.unlinkSync(this.filePath(name))
  }

  private filePath(name: string)
  {
    const re = RegExp(`.${this.extension}$`)
    const path = (re.test(name)) ? name : `${name}.${this.extension}`
    return (this.parent_dir) ? path.join(this.parent_dir, path) : path
  }

}
