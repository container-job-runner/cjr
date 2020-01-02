import * as fs from 'fs'
import * as path from 'path'

export class JSONFileWriter
{
  private parent_dir: string // files will be created relative to the parent_dir

  constructor(parent_dir: string)
  {
    // verify config directory exists or create
    if(!fs.existsSync(parent_dir)){
        fs.mkdirSync(parent_dir, {recursive: true})
    }
    this.parent_dir = parent_dir
  }

  write(name:string, data:object)
  {
    fs.writeFileSync(
      this.filePath(name),
      JSON.stringify(data))
  }

  read(name:string)
  {
    try
    {
      return JSON.parse(fs.readFileSync(this.filePath(name)))
    }
    catch(e)
    {
      return {}
    }
  }

  delete(name:string)
  {
    fs.unlinkSync(this.filePath(name))
  }

  private filePath(name: string)
  {
    return path.join(this.parent_dir, (/.json$/.test(name)) ? name : `${name}.json`)
  }

}
