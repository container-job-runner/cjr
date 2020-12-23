import chalk = require('chalk')
import { flags } from '@oclif/command'
import { ServiceCommand } from '../../lib/commands/service-command'
import { printValidatedOutput, printHorizontalTable } from '../../lib/functions/misc-functions'
import { TheiaService } from '../../lib/services/theia-service'
import { ServiceInfo } from '../../lib/services/abstract/abstract-service'

export default class List extends ServiceCommand {
  static description = 'List running Theia servers.'
  static args = []
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"resource": false})
    const job_manager = this.newJobManager(flags['resource'] || 'localhost', {verbose: false, quiet: false, explicit: flags['explicit']})
    const theia_service = new TheiaService(job_manager)
    
    const list_request = theia_service.list()
    if( ! list_request.success )
       return printValidatedOutput(list_request)

    if(flags["json"]) // -- json output ---------------------------------------
       return console.log(JSON.stringify(list_request.value))

    // -- regular output ------------------------------------------------------
    const table_parameters = {
        row_headers:    ["PROJECT", "URL"],
        column_widths:  [9, 100],
        text_widths:    [7, 100],
        silent_clip:    [true, false]
    }
    const toArray = (e:ServiceInfo) => [chalk`{green ${e["project-root"] || "none"}}`, chalk`{underline http://${e["access-ip"]}:${e["access-port"]}}`]
    printHorizontalTable({ ... table_parameters, ... {
      data: list_request.value.map(toArray)
    }})
  }

}
