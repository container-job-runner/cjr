import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {JSTools} from '../../lib/js-tools'
import {allJobIds, matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Stop extends StackCommand {
  static description = 'Stop a running job. This command has no effect on completed jobs.'
  static args = [{name: 'id'}]
  static flags = {
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({default: [""], multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    explicit: flags.boolean({default: false}),
    "quiet":flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner  = this.newRunner(flags.explicit)
    var stack_paths = flags['visible-stacks'].map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    var ids_to_stop:Array<string> = []
    if(flags.all) // -- stop all running jobs ----------------------------------
      ids_to_stop = allJobIds(runner, stack_paths, ["running"])
    else if(flags["all-completed"]) // -- delete all jobs ----------------------
      ids_to_stop = allJobIds(runner, stack_paths, ["exited"])
    else if(flags["all-running"])
      ids_to_stop = allJobIds(runner, stack_paths, ["running"])
    else  // -- stop only jobs specified by user -------------------------------
    {
      const id = (argv.length > 0) ? argv : (await promptUserForJobId(runner, stack_paths, ["running"], !this.settings.get('interactive')) || "")
      if(id === "") return // exit if user selects empty
      const result = matchingJobIds(runner, JSTools.arrayWrap(id), stack_paths)
      if(result.success) ids_to_stop = result.data
      printResultState(result)
    }
    // -- stop jobs ------------------------------------------------------------
    if(!flags.quiet) ids_to_stop.map((x:string) => console.log(` Stopping ${x}`))
    runner.jobStop(ids_to_stop)
  }

}
