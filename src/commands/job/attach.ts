import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'
import {ShellCMD} from '../../lib/shellcmd'
import {matchingJobIds} from '../../lib/functions/run-functions'

export default class Attach extends StackCommand {
  static description = 'attach back to the shell that is running a job.'
  static args = [{name: 'id', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Attach)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    var id = argv[0]
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    // match with existing container ids
    var result = matchingJobIds(runner, stack_path, id, false)
    if(result.success)
    {
        runner.jobAttach(result.data[0])
    }
    this.handleErrors(result.error);
  }

}
