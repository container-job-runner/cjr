import chalk = require('chalk')
import { BasicCommand } from '../../lib/commands/basic-command'
import { flags } from '@oclif/command'
import { printValidatedOutput, printHorizontalTable } from '../../lib/functions/misc-functions'
import { listTheia, TheiaJobInfo } from '../../lib/functions/theia-functions'

export default class List extends BasicCommand {
  static description = 'List Running theia servers.'
  static args = []
  static flags = {
    "resource": flags.string({env: 'RESOURCE'}),
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"resource": false})
    const job_manager = this.newJobManager(flags['resource'] || 'localhost', {verbose: false, quiet: false, explicit: flags['explicit']})
    const result = listTheia(job_manager)
    if(!result.success)
      return printValidatedOutput(result)

    if(flags["json"]) // -- json output ---------------------------------------
      return console.log(JSON.stringify(result.value))

    // -- regular output ------------------------------------------------------
    const table_parameters = {
        row_headers:    ["PROJECT", "URL"],
        column_widths:  [9, 100],
        text_widths:    [7, 100],
        silent_clip:    [true, false]
    }
    const toArray = (e:TheiaJobInfo) => [chalk`{green ${e["project-root"] || "none"}}`, chalk`{underline ${e.url}}`]
    printHorizontalTable({ ... table_parameters, ... {
      data: result.value.map(toArray)
    }})
  }

}
