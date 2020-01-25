import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Attach extends StackCommand {
  static description = 'Attach back to the shell that is running a job.'
  static args = [{name: 'id', required: false}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Attach)
    const runner  = this.newRunner(flags.explicit)
    var stack_path = (flags?.stack) ? this.fullStackPath(flags.stack) : ""
    var id = argv[0] || await promptUserForJobId(runner, stack_path, !this.settings.get('interactive')) || ""

    // match with existing container ids
    var result = matchingJobIds(runner, stack_path, id, false)
    if(result.success)
    {
        runner.jobAttach(result.data[0])
    }
    printResultState(result)
  }

}
