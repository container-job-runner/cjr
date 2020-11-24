import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { printJobProperties } from '../../lib/functions/cli-functions'
import { JobProperties } from '../../lib/job-managers/abstract/job-manager'

export default class Info extends BasicCommand {
  static description = 'Get detailed information on the hidden properties of a job.'
  static args = [{name: 'id'}]
  static flags = {
    "resource": flags.string({env: 'RESOURCE'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { argv, flags } = this.parse(Info)
    this.augmentFlagsWithProjectSettings(flags, {
      "visible-stacks":false,
      "stacks-dir": false,
      "resource": false
    })

    // -- get job id -----------------------------------------------------------
    const ids = await this.getJobIds(argv, flags, ['running'])
    if(ids === false) return // exit if user selects empty id or exits interactive dialog

    // -- stop job -------------------------------------------------------------
    const job_manager = this.newJobManager(
      flags['resource'] || "localhost",
      {
        verbose: false,
        quiet: false,
        explicit: flags['explicit']
      }
    )
    
    const job_properties = job_manager.properties({
        "ids": ids || undefined,
        "stack-paths": this.extractVisibleStacks(flags)
    })
    
    if ( !job_properties.success )
        return printValidatedOutput(job_properties)

    if(flags['json'])
        console.log(JSON.stringify(job_properties.value))
    else
        job_properties.value.map((jp:JobProperties, index: number) => {
            printJobProperties(jp)
            if (index < job_properties.value.length - 1)
                console.log()
        })

  }

}
