import * as path from 'path'
import * as fs from 'fs-extra'
import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { ShellCommand } from '../../lib/shell-command'
import { ValidatedOutput } from '../../lib/validated-output'
import { FileTools } from '../../lib/fileio/file-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { promptUserForGitPull } from '../../lib/functions/cli-functions'

export default class Pull extends BasicCommand {
  static description = 'Clones or pulls a stack using git directly into the stack folder.'
  static args = [{name: 'url', required: true}]
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "debug": flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(Pull)
    this.augmentFlagsWithProjectSettings(flags, {"stacks-dir": true})
    const shell = new ShellCommand(flags.debug, false)
    // -- get stacks directory and name of git repo ----------------------------
    const local_stacks_path = flags["stacks-dir"] || this.settings.get("stacks-dir")
    fs.ensureDirSync(local_stacks_path)
    const repo_name = args.url.split("/").pop().replace(/.git$/, "")
    const stack_abs_path = path.join(local_stacks_path, repo_name)
    // -- exit if git does not exist -------------------------------------------
    if(!shell.output('git', {version: {}}).success)
        return printValidatedOutput(new ValidatedOutput(true, []).pushError('cannot pull stack, git is not installed.'));
    
    const stack_exists = FileTools.existsDir(stack_abs_path)
    if(stack_exists && await promptUserForGitPull(this.settings.get('interactive')))
      shell.exec('git pull', {}, [], {cwd: stack_abs_path})
    else if(!stack_exists)
      shell.exec('git clone', {depth: "1"}, [args.url], {cwd: local_stacks_path})
  }

}
