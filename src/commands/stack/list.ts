import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import * as fs from 'fs'

export default class List extends StackCommand {
  static description = 'List all stacks present in the stacks path.'
  static args = []
  static flags = {
    stacks_path: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(List)
    const stacks_path = flags.stacks_path || this.settings.get("stacks_path")
    fs.readdirSync(stacks_path).map((path, i) => console.log(`\t${i+1}. ${path}`))
  }

}
