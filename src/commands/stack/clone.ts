import * as fs from 'fs'
import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {ShellCMD} from '../../lib/shellcmd'

export default class Pull extends StackCommand {
  static description = 'pulls a stack using git directly into the stack folder.'
  static args = [{name: 'url', required: true}]
  static flags = {
    stacks_path: flags.string(),
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Pull)
    const shell = new ShellCMD(flags.explicit, false)
    const command = 'git clone'
    const cmd_flags = {depth: {shorthand:false, value: "1"}}
    const result = shell.output(command, cmd_flags, argv, {cwd: this.settings.get('stacks_path')})
    printResultState(result);
  }

}
