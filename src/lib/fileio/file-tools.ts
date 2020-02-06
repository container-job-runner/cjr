import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import {ValidatedOutput} from '../validated-output'
import {ShellCommand} from '../shell-command'
import {JSTools} from '../js-tools'

export class FileTools
{

  static existsDir(path_str: string) // determines if directory exists
  {
    return fs.existsSync(path_str) && fs.lstatSync(path_str).isDirectory()
  }

  static existsFile(path_str: string) // determines if file exists
  {
    return fs.existsSync(path_str) && fs.lstatSync(path_str).isFile()
  }

  // creates a temporary directory inside parent_abs_path
  static mktempDir(parent_abs_path: string, shell:ShellCommand = new ShellCommand(false, false))
  {
    fs.ensureDir(parent_abs_path)
    switch(os.platform())
    {
      case "darwin":
        return shell.output('mktemp', {d: {}}, [path.join(parent_abs_path, "tmp.XXXXXXXXXX")], {}, "trim")
      case "linux":
        const flags = {
          tmpdir: parent_abs_path,
          directory: {}
        }
        return shell.output('mktemp', flags, [], {}, "trim")
      default: // not thread safe
        var data = fs.ensureDir(path.join(parent_abs_path, `tmp.${JSTools.randomString(10)}`))
        return new ValidatedOutput(true, data)
    }
  }

}
