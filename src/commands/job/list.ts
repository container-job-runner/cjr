import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {ShellCMD} from '../../lib/shellcmd'

export default class List extends StackCommand {
  static description = 'List all running jobs for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    explicit: flags.boolean({default: false}),
    json: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(List, true)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    const results = runner.jobList(stack_path, flags['json'])
  }

}
