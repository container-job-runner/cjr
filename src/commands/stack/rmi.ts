import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Build extends StackCommand {
  static description = 'Delete an image associated with a stack.'
  static args = []
  static flags = {
    stack:    flags.string({env: 'STACK', default: false}),
    explicit: flags.boolean({default: false}),
    silent:   flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Build, true)
    const builder = this.newBuilder(flags.explicit, flags.silent)
    const stack_path = this.fullStackPath(flags.stack)
    const result = builder.removeImage(stack_path)
    printResultState(result)
  }

}
