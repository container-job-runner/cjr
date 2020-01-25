import {flags} from '@oclif/command'
import {JobCommand} from '../../lib/commands/job-command'
import {matchingResultIds, promptUserForResultId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Delete extends JobCommand {
  static description = 'Permanently delete a result and all its associated data.'
  static args = [{name: 'id'}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Delete)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    const stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    const id = (flags.all) ? "" : (argv[0] || await promptUserForResultId(runner, stack_path, !this.settings.get('interactive')) || "")
    // match with existing container ids
    var result = matchingResultIds(runner, stack_path, id, flags['all'])
    if(result.success)
    {
        runner.resultDelete(result.data)
        result.data.map((x:string) => this.job_json.delete(x))
        result.data.map((x:string) => console.log(` Deleting ${x}`))
    }
    printResultState(result)
  }

}
