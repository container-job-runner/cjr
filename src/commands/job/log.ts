import { flags } from '@oclif/command'
import { StackCommand } from '../../lib/commands/stack-command'
import { printResultState } from '../../lib/functions/misc-functions'
import { promptUserForJobId } from '../../lib/functions/cli-functions'
import { firstJobId } from '../../lib/drivers-containers/abstract/run-driver'

export default class Log extends StackCommand {
  static description = 'Print console output generated by a job.'
  static args = [{name: 'id'}]
  static flags = {
    "all": flags.boolean({default: false, description: "show all output"}),
    "lines": flags.integer({default: 100}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const { argv, flags } = this.parse(Log)
    this.augmentFlagsWithProjectSettings(flags, {
      "visible-stacks":false,
      "stacks-dir": false,
    })
    // -- get job id -----------------------------------------------------------
    const job_id = await this.getJobId(argv, flags)
    if(job_id === false) return // exit if user selects empty id or exits interactive dialog

    const { job_manager } = this.initContainerSDK(false, false, flags['explicit'])
    const log = job_manager.log({
      "id": job_id,
      "stack-paths": this.extractVisibleStacks(flags),
      "lines": (flags.all) ? "all" : `${flags.lines}`
    })

    if(!log.success)
      return printResultState(log)
    console.log(log.value)
  }

}
