import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {allJobIds, matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Stop extends StackCommand {
  static description = 'Stop a running job. This command has no effect on completed jobs.'
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
    const {argv, flags} = this.parse(Stop)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    var ids_to_stop:Array<string> = []
    if(flags.all) // -- stop all running jobs ----------------------------------
      ids_to_stop = allJobIds(runner, stack_path, "running")
    else if(flags["all-completed"]) // -- delete all jobs ----------------------
      ids_to_stop = allJobIds(runner, stack_path, "exited")
    else if(flags["all-running"])
      ids_to_stop = allJobIds(runner, stack_path, "running")
    else  // -- stop only jobs specified by user -------------------------------
    {
      const id = (argv[0] || await promptUserForJobId(runner, stack_path, "running", !this.settings.get('interactive')) || "")
      const result = matchingJobIds(runner, id, stack_path)
      if(result.success) ids_to_stop = result.data
      printResultState(result)
    }
    // -- stop jobs ------------------------------------------------------------
    if(!flags.silent) ids_to_stop.map((x:string) => console.log(` Stopping ${x}`))
    runner.jobStop(ids_to_stop)
  }

}
