import * as path from 'path'
import * as fs from 'fs-extra'
import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {ShellCommand} from '../../lib/shell-command'
import {ValidatedOutput} from '../../lib/validated-output'
import {FileTools} from '../../lib/fileio/file-tools'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Pull extends StackCommand {
  static description = 'Clones or pulls a stack using git directly into the stack folder.'
  static args = [{name: 'url', required: true}]
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(Pull)
    this.augmentFlagsWithProjectSettings(flags, {"stacks-dir": true})
    const shell = new ShellCommand(flags.explicit, false)
    var result: ValidatedOutput<any>
    // -- get stacks directory and name of git repo ----------------------------
    const local_stacks_path = flags["stacks-dir"] || this.settings.get("stacks-dir")
    fs.ensureDirSync(local_stacks_path)
    const repo_name = args.url.split("/").pop().replace(/.git$/, "")
    const stack_abs_path = path.join(local_stacks_path, repo_name)
    if(FileTools.existsDir(stack_abs_path))
      result = shell.output('git pull', {}, [], {cwd: stack_abs_path})
    else
      result = shell.output('git clone', {depth: "1"}, [args.url], {cwd: local_stacks_path})
    printResultState(result);
  }

}
