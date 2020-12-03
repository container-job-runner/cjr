import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { Dictionary } from '../../lib/constants'
import { printValidatedOutput } from '../../lib/functions/misc-functions'

export default class Delete extends BasicCommand {
  static description = 'Delete a job and its associated data; works on both running and completed jobs.'
  static args = [{name: 'id'}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "all": flags.boolean({default: false}),
    "all-exited": flags.boolean({default: false, exclusive: ['all', 'all-running']}),
    "all-running": flags.boolean({default: false, exclusive: ['all', 'all-exited']}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "verbose": flags.boolean({default: false, char: 'v', exclusive: ['quiet']}),
    "explicit": flags.boolean({default: false}),
    "quiet":flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const { argv, flags } = this.parse(Delete)
    this.augmentFlagsWithProjectSettings(flags, {
      "visible-stacks":false,
      "stacks-dir": false,
      "resource": false
    })

    // -- get job id -----------------------------------------------------------
    const id_selector_active = flags['all'] || flags['all-running'] || flags['all-exited'] // do not prompt for id if these flags are selected
    const ids = (id_selector_active) ? [] : await this.getJobIds(argv, flags)
    if(ids === false) return // exit if user selects empty id or exits interactive dialog

    // -- delete job -----------------------------------------------------------
    const job_manager = this.newJobManager(
      flags['resource'] || "localhost",
      {
        "verbose": flags['verbose'],
        "quiet": flags['quiet'],
        "explicit": flags['explicit']
      }
    )
    printValidatedOutput(
      job_manager.delete({
        "ids": ids,
        "states": this.parseSelector(flags),
        "stack-paths": this.extractVisibleStacks(flags)
      })
    )
  }

  parseSelector(flags: Dictionary) : undefined|["exited"]|["running"]
  {
    if(flags["all-exited"]) return ["exited"]
    if(flags["all-running"]) return ["running"]
    return undefined
  }

}
