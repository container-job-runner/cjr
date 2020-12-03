import chalk = require('chalk')
import { flags } from '@oclif/command'
import { ServerCommand } from '../../lib/commands/server-command'
import { printValidatedOutput, printHorizontalTable } from '../../lib/functions/misc-functions'
import { JupyterService } from '../../lib/services/JupyterService'
import { ServiceInfo } from '../../lib/services/abstract/AbstractService'

export default class List extends ServerCommand {
  static description = 'List running Jupyter servers.'
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
    const jupyter_interface = (this.settings.get('jupyter-command') == "jupyter lab") ? "lab" : "notebook"
    const jupyter_service = new JupyterService(job_manager, {"interface" : jupyter_interface})
    
    const list_request = jupyter_service.list()
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
    const toArray = (e:ServiceInfo) => [chalk`{green ${e["project-root"] || "none"}}`, chalk`{underline ${e.url}:${e.port}}`]
    printHorizontalTable({ ... table_parameters, ... {
      data: list_request.value.map(toArray)
    }})
  }

}
