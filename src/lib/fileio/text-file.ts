import * as fs from 'fs'
import * as path from 'path'
import {ValidatedOutput} from "../validated-output"

export class TextFile
{
  parent_dir: string // files will be created relative to the parent_dir
  create_base_dir: boolean = false
  private extension: string = "txt"
  private validator = (x) => x

  constructor(parent_dir: string = "", create_base_dir: boolean = false, validator = (x) => x)
  {
    this.parent_dir = parent_dir
    this.validator = validator
    this.create_base_dir = create_base_dir
  }

  write(name:string, data_str:string)
  {
    const file_path = this.filePath(name)
    const dir_name  = path.dirname(file_path)
    try
    {
      // create parent directory if create_base_dir = true and directory does not exist
      if(this.create_base_dir && dir_name && !fs.existsSync(dir_name)) {
        fs.mkdirSync(dir_name, {recursive: true})
      }
      // write to file
      return new ValidatedOutput(
        true,
        fs.writeFileSync(this.filePath(name), data_str)
      )
    }
    catch(e)
    {
      return new ValidatedOutput(false, e)
    }
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
      return new ValidatedOutput(false, e)
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
    const file_path = (re.test(name)) ? name : `${name}.${this.extension}`
    return (this.parent_dir) ? path.join(this.parent_dir, file_path) : file_path
  }

}
