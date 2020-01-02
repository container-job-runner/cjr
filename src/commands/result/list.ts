import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'
import {ShellCMD} from '../../lib/shellcmd'

export default class List extends StackCommand {
  static description = 'list currently all results'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK', required: true}),
    explicit: flags.boolean({default: false}),
    json: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(List)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    const results = runner.resultList(stack_path, flags['json'])
  }

}
