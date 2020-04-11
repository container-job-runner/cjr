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
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({default: [], multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    explicit: flags.boolean({default: false}),
    silent: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Delete)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunner(flags.explicit)
    var stack_paths = flags['visible-stacks'].map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    var job_info:Array<Dictionary> = []
    if(flags.all) // -- delete all jobs ----------------------------------------
      job_info = runner.jobInfo(stack_paths)
    else if(flags["all-completed"]) // -- delete all jobs ----------------------
      job_info = runner.jobInfo(stack_paths, ["exited"])
    else if(flags["all-running"])
      job_info = runner.jobInfo(stack_paths, ["running"])
    else  // -- stop only jobs specified by user -------------------------------
    {
      const ids = (argv.length > 0) ? argv : (await promptUserForJobId(runner, stack_paths, [], !this.settings.get('interactive')) || "")
      if(ids === "") return // exit if user selects empty
      const result = matchingJobInfo(runner, JSTools.arrayWrap(ids), stack_paths)
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
