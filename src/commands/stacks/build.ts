import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'

export default class Build extends StackCommand {
  static description = 'build an image'
  static args = []
  static flags = {
    stack:    flags.string({env: 'STACK', required: true}),
    explicit: flags.boolean({default: false}),
    silent:   flags.boolean({default: false}),
    nocache:  flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Build)
    const builder = this.newBuilder(flags.explicit, flags.silent)
    const stack_path = this.fullStackPath(flags.stack)
    const result = builder.build(stack_path, flags['nocache'])
    if(!result.success) this.handleErrors(result.error)
  }

}
