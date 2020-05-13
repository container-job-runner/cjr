import { flags } from '@oclif/command'
import { StackCommand } from '../../lib/commands/stack-command'
import { JSTools } from '../../lib/js-tools'
import { promptUserForJobId, jobIds } from '../../lib/functions/run-functions'
import { printResultState } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'
import { JobInfo } from '../../lib/drivers-containers/abstract/run-driver'

export default class Stop extends StackCommand {
  static description = 'Stop a running job. This command has no effect on completed jobs.'
  static args = [{name: 'id'}]
  static flags = {
    "all": flags.boolean({default: false, description: "stop all running jobs"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false}),
    "quiet":flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunDriver(flags.explicit)
    const stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    var job_info:ValidatedOutput<Array<JobInfo>>
    if(flags.all) // -- stop all running jobs ----------------------------------
      job_info = runner.jobInfo({'stack-paths': stack_paths, 'states': ["running"]})
    else  // -- stop only jobs specified by user -------------------------------
    {
      const ids = (argv.length > 0) ? argv : (await promptUserForJobId(runner, stack_paths, ["running"], !this.settings.get('interactive')) || "")
      if(ids === "") return // exit if user selects empty
      job_info = runner.jobInfo({'ids': JSTools.arrayWrap(ids), 'stack-paths': stack_paths})
    }
    // -- stop jobs ------------------------------------------------------------
    const ids_to_stop = jobIds(job_info).value
    if(!flags.quiet) ids_to_stop.map((x:string) => console.log(` Stopping ${x}`))
    runner.jobStop(ids_to_stop)
  }

}
