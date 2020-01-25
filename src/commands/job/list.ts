import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'

export default class List extends StackCommand {
  static description = 'List all running jobs for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    json: flags.boolean({default: false}),
    all: flags.boolean({default: false}) //if true shows jobs from all cjr stacks, regardless of whether stack is set
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(List, false)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (!flags.all && flags.stack) ? this.fullStackPath(flags.stack) : ""
    const results = runner.jobList(stack_path, flags['json'])
  }

}
