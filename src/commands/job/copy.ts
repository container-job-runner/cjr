import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {matchingJobInfo, promptUserForJobId, readJobInfoLabel} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Copy extends StackCommand {
  static description = 'Copy job data back into the host directories. Works with both running and completed jobs.'
  static args = [{name: 'id', required: false}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "copy-path": flags.string({description: "overides job default copy path"}),
    explicit: flags.boolean({default: false}),
    verbose: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Copy)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    var id = argv[0] || await promptUserForJobId(runner, stack_path, "", !this.settings.get('interactive')) || ""
    // match with existing container ids
    var result = matchingJobInfo(runner, [id], stack_path)
    if(!result.success) return printResultState(result)
    // copy results from any matching jobs
    const job_info = result.data
    job_info.map((job:Dictionary) => {
      const info_label = readJobInfoLabel(job)
      if(flags["copy-path"]) info_label["hostCopyPath"] = flags["copy-path"]
      result = runner.jobCopy(job.id, info_label, flags["all"], flags.verbose)
      if(!result.success) return printResultState(result)
    })
  }

}
