import {flags} from '@oclif/command'
import {JobCommand} from '../../lib/job-command'
import {ShellCMD} from '../../lib/shellcmd'
import {matchingJobIds} from '../../lib/drivers/run/functions'

export default class Destroy extends JobCommand {
  static description = 'stop a job and destroy associated result.'
  static args = [{name: 'id', required: true}]
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
    var id = argv[0] || "" // allow for empty if all is selected
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    // match with existing container ids
    var result = matchingJobIds(runner, stack_path, id, flags['all'])
    if(result.success)
    {
        runner.jobDestroy(result.data)
        result.data.map(x => this.job_json.delete(x))
        result.data.map(x => console.log(` Stopping ${x} and destroying results.`))
    }
    this.handleErrors(result.error);
  }

}
