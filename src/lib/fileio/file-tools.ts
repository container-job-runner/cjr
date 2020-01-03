import * as fs from 'fs'

export class FileTools
{

  static existsDir(path_str: string)
  {
    return fs.existsSync(path_str) && fs.lstatSync(path_str).isDirectory()
  }

  static existsFile(path_str: string)
  {
    return fs.existsSync(path_str) && fs.lstatSync(path_str).isFile()
  }

}
