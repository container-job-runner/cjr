import {flags} from '@oclif/command'
import {JobCommand} from '../../lib/commands/job-command'
import {ShellCMD} from '../../lib/shellcmd'
import {matchingResultIds} from '../../lib/functions/run-functions'

export default class Remove extends JobCommand {
  static description = 'Permanently delete a result and all its associated data.'
  static args = [{name: 'id'}]
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Remove)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    var id = argv[0] || "" // allow for empty if all is selected
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    // match with existing container ids
    var result = matchingResultIds(runner, stack_path, id, flags['all'])
    if(result.success)
    {
        runner.resultDelete(result.data)
        result.data.map(x => this.job_json.delete(x))
        result.data.map(x => console.log(` Deleting ${x}`))
    }
    this.handleFinalOutput(result)
  }

}
