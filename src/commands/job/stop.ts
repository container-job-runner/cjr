import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Stop extends StackCommand {
  static description = 'Stop a running job and turn it into a result.'
  static args = [{name: 'id'}]
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Stop)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    const stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    const id = (flags.all) ? "" : (argv[0] || await promptUserForJobId(runner, stack_path, !this.settings.get('interactive')) || "")
    // match with existing container ids
    var result = matchingJobIds(runner, stack_path, id, flags['all'])
    if(result.success)
    {
        result.data.map(x => console.log(` Stopping ${x}`))
        runner.jobStop(result.data)
    }
    printResultState(result)
  }

}
