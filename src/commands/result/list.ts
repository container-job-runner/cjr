import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {ShellCMD} from '../../lib/shellcmd'

export default class List extends StackCommand {
  static description = 'List all results (i.e. completed jobs) for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    explicit: flags.boolean({default: false}),
    json: flags.boolean({default: false}),
    all: flags.boolean({default: false}) //if true shows result from all cjr stacks, regardless of whether stack is set
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(List, false)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (!flags.all && flags.stack) ? this.fullStackPath(flags.stack) : ""
    const results = runner.resultList(stack_path, flags['json'])
  }

}
