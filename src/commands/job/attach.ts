import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'

export default class Attach extends BasicCommand {
  static description = 'Attach to a running job.'
  static args = [{name: 'id', required: false}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "debug": flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const { argv, flags } = this.parse(Attach)
    this.augmentFlagsWithProjectSettings(flags, {
      "visible-stacks":false,
      "stacks-dir": false,
      "resource": false
    })
    // -- get job id -----------------------------------------------------------
    const job_id = await this.getJobId(argv, flags, ["running"])
    if(job_id === false) return // exit if user selects empty id or exits interactive dialog
    // -- attach ---------------------------------------------------------------
    const job_manager = this.newJobManager(
        flags['resource'] || "localhost", 
        {
            verbose: false, 
            quiet: false, 
            debug: flags['debug']
        }
    )
    printValidatedOutput(
      job_manager.attach({
        "id": job_id,
        "stack-paths": this.extractVisibleStacks(flags)
      })
    )
  }

}
