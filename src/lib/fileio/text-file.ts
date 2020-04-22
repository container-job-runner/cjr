import * as fs from 'fs'
import * as path from 'path'
import {ValidatedOutput} from "../validated-output"

export class TextFile
{
  parent_dir: string // files will be created relative to the parent_dir
  create_base_dir: boolean
  add_extension: boolean = true
  protected extension: string = "txt"
  protected validator: (x: any) => ValidatedOutput<undefined> // validates content and can append errors into ValidatedOutput

  constructor(parent_dir: string = "", create_base_dir: boolean = false, validator = (x:any) => new ValidatedOutput(true, undefined))
  {
    this.parent_dir = parent_dir
    this.validator = validator
    this.create_base_dir = create_base_dir
  }

  write(name: string, data_str: any) : ValidatedOutput<Error>|ValidatedOutput<undefined>
  {
    const file_path = this.filePath(name)
    const dir_name  = path.dirname(file_path)
    try
    {
      // create parent directory if create_base_dir = true and directory does not exist
      if(this.create_base_dir && dir_name && !fs.existsSync(dir_name))
        fs.mkdirSync(dir_name, {recursive: true})
      // write to file
      fs.writeFileSync(this.filePath(name), data_str)
      return new ValidatedOutput(true, undefined)
    }
    catch(e)
    {
      if(e instanceof Error)
        return new ValidatedOutput(false, e)
      else
        return new ValidatedOutput(false, undefined)
    }
  }

  read(name:string) : ValidatedOutput<any>
  {
    try {
      return new ValidatedOutput(
        true,
        fs.readFileSync(this.filePath(name),'utf8')
      )
    }
    catch(e) {
      return new ValidatedOutput(false, "")
    }
  }

  validatedRead(name:string) : ValidatedOutput<any>
  {
    var result = this.read(name)
    if(result.success) result.absorb(this.validator(result.data))
    return result
  }

  validatedWrite(name: string, data: any) : ValidatedOutput<Error>|ValidatedOutput<undefined>
  {
    var result = this.validator(data)
    if(result.success)
      return this.write(name, data)
    else
      return result
  }

  delete(name:string) : ValidatedOutput<Error>|ValidatedOutput<undefined>
  {
    try {
      fs.unlinkSync(this.filePath(name))
      return new ValidatedOutput(true, undefined)
    }
    catch (e) {
      if(e instanceof Error)
        return new ValidatedOutput(false, e)
      else
        return new ValidatedOutput(false, undefined)
    }
  }

  private filePath(name: string)
  {
    const re = RegExp(`.${this.extension}$`)
    const file_path = (re.test(name) || !this.add_extension) ? name : `${name}.${this.extension}`
    return (this.parent_dir) ? path.join(this.parent_dir, file_path) : file_path
  }

}
