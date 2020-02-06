import * as fs from 'fs'
import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {ShellCommand} from '../../lib/shell-command'

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
    const shell = new ShellCommand(flags.explicit, false)
    const result = shell.output('git clone', {depth: "1"}, argv, {cwd: this.settings.get('stacks_path')})
    printResultState(result);
  }

}
