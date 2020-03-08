import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {matchingJobInfo} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class State extends StackCommand {
  static description = 'get the current state of a single job'
  static args = [{name: 'id', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(State)
    const runner  = this.newRunner(false)
    const stack_path = (flags?.stack) ? this.fullStackPath(flags.stack) : ""
    const result = matchingJobInfo(runner, [args.id], stack_path)
    if(!result.success) return printResultState(result)
    const job_info = result.data
    console.log(job_info[0].status)
  }

}
