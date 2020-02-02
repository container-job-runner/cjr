import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import {ValidatedOutput} from '../validated-output'
import {ShellCMD} from '../shellcmd'
import {JSTools} from '../js-tools'

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

  static mktempDir(parent_abs_path: string, shell:ShellCMD = new ShellCMD(false, false))
  {
    fs.ensureDir(parent_abs_path)
    switch(os.platform())
    {
      case "darwin":
        return shell.output('mktemp', {d: {shorthand: true}}, [path.join(parent_abs_path, "tmp.XXXXXXXXXX")], {}, "trim")
      case "linux":
        const flags = {
          tmpdir: {shorthand: false, value: parent_abs_path},
          directory: {shorthand: false}
        }
        return shell.output('mktemp', flags, [], {}, "trim")
      default: // unsafe
        var data = fs.ensureDir(path.join(parent_abs_path, `tmp.${JSTools.randomString(10)}`))
        return new ValidatedOutput(true, data)
    }
  }

}
