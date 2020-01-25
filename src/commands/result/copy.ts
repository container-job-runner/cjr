import {flags} from '@oclif/command'
import {JobCommand} from '../../lib/commands/job-command'
import {matchingResultIds, promptUserForResultId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Copy extends JobCommand {
  static description = 'Copy job results back into the host directories.'
  static args = [{name: 'id', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Copy)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    var id = argv[0] || await promptUserForResultId(runner, stack_path, !this.settings.get('interactive')) || ""
    // match with existing container ids
    var result = matchingResultIds(runner, stack_path, id)
    if(result.success)
    {
      const id = result.data[0] // only process single result
      result = this.job_json.read(id)
      if(result.success)
      {
        const job_object = result.data
        result = runner.resultCopy(id, job_object, flags["all"])
      }
    }
    printResultState(result)
  }

}
