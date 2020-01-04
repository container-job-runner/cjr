import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'
import {ShellCMD} from '../../lib/shellcmd'
import {matchingJobIds} from '../../lib/functions/run-functions'

export default class Stop extends StackCommand {
  static description = 'stop a running job and turn it into a result.'
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
    var id = argv[0] || "" // allow for empty if all is selected
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    // match with existing container ids
    var result = matchingJobIds(runner, stack_path, id, flags['all'])
    if(result.success)
    {
        result.data.map(x => console.log(` Stopping ${x}`))
        runner.jobStop(result.data)
    }
    this.handleErrors(result.error);
  }

}
