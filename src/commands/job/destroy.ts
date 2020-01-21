import {flags} from '@oclif/command'
import {JobCommand} from '../../lib/commands/job-command'
import {matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Destroy extends JobCommand {
  static description = 'Stop a job and destroy the associated result.'
  static args = [{name: 'id'}]
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Destroy)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    const stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    const id = (flags.all) ? "" : (argv[0] || await promptUserForJobId(runner, stack_path, !this.settings.get('interactive')) || "")
    // match with existing container ids
    var result = matchingJobIds(runner, stack_path, id, flags['all'])
    if(result.success)
    {
        runner.jobDestroy(result.data)
        result.data.map(x => this.job_json.delete(x))
        result.data.map(x => console.log(` Stopping ${x} and destroying results.`))
    }
    printResultState(result)
  }

}
