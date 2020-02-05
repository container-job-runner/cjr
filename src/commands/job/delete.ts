import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {allJobIds, matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

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
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Delete)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (flags?.stack) ? this.fullStackPath(flags.stack) : ""
    var ids_to_delete:Array<string> = []
    if(flags.all) // -- delete all jobs ----------------------------------------
      ids_to_delete = allJobIds(runner, stack_path)
    else if(flags["all-completed"]) // -- delete all jobs ----------------------
      ids_to_delete = allJobIds(runner, stack_path, "exited")
    else if(flags["all-running"])
      ids_to_delete = allJobIds(runner, stack_path, "running")
    else  // -- stop only jobs specified by user -------------------------------
    {
      const id = (argv[0] || await promptUserForJobId(runner, stack_path, "", !this.settings.get('interactive')) || "")
      const result = matchingJobIds(runner, id, stack_path)
      if(result.success) ids_to_delete = result.data
      printResultState(result)
    }
    // -- delete jobs ----------------------------------------------------------
    if(!flags.silent) ids_to_delete.map((x:string) => console.log(` Deleting ${x}`))
    runner.jobDelete(ids_to_delete)
  }

}
