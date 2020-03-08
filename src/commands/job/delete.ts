import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {JSTools} from '../../lib/js-tools'
import {allJobIds, matchingJobInfo, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'
import {file_volume_label} from '../../lib/constants'

export default class Delete extends StackCommand {
  static description = 'Delete a job and its associated data. This command works on both running and completed jobs'
  static args = [{name: 'id'}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    silent: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Delete)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (flags?.stack) ? this.fullStackPath(flags.stack) : ""
    var job_info:Array<Dictionary> = []
    if(flags.all) // -- delete all jobs ----------------------------------------
      job_info = runner.jobInfo(stack_path)
    else if(flags["all-completed"]) // -- delete all jobs ----------------------
      job_info = runner.jobInfo(stack_path, "exited")
    else if(flags["all-running"])
      job_info = runner.jobInfo(stack_path, "running")
    else  // -- stop only jobs specified by user -------------------------------
    {
      const ids = (argv.length > 0) ? argv : (await promptUserForJobId(runner, stack_path, "", !this.settings.get('interactive')) || "")
      if(ids === "") return // exit if user selects empty
      const result = matchingJobInfo(runner, JSTools.arrayWrap(ids), stack_path)
      if(result.success) job_info = result.data
      printResultState(result)
    }
    // -- delete jobs ----------------------------------------------------------
    const job_ids = job_info.map((job:Dictionary) => job.id)
    const volume_ids = job_info.map((job:Dictionary) => job?.labels?.[file_volume_label] || "").filter((s:string) => s !== "")
    if(!flags.silent) job_ids.map((x:string) => console.log(` Deleting ${x}`))
    runner.jobDelete(job_ids)
    runner.volumeDelete(volume_ids)
  }

}
