import chalk = require('chalk')
import { BasicCommand } from '../../../lib/commands/basic-command'
import { flags } from '@oclif/command'
import { printValidatedOutput, printHorizontalTable } from '../../../lib/functions/misc-functions'
import { JupyterJobInfo, listJupyter } from '../../../lib/functions/jupyter-functions'

export default class List extends BasicCommand {
  static description = 'List running jupiter servers.'
  static args = [{name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "resource": flags.string({default: 'localhost', env: 'RESOURCE'}),
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(List)
    const job_manager = this.newJobManager(flags['resource'], false, false, flags['explicit'])
    const result = listJupyter(job_manager, "in-job")
    if(!result.success)
      return printValidatedOutput(result)

    if(flags["json"]) // -- json output ---------------------------------------
      return console.log(JSON.stringify(result.value))

    // -- regular output ------------------------------------------------------
    const table_parameters = {
        row_headers:    ["PARENT-JOB", "URL"],
        column_widths:  [12, 100],
        text_widths:    [10, 100],
        silent_clip:    [true, false]
    }
    const toArray = (e:JupyterJobInfo) => [e["parent-job-id"]?.substring(0, 12) || "none", chalk`{underline ${e.url}}`]
    printHorizontalTable({ ... table_parameters, ... {
      data:  result.value.map(toArray)
    }})
  }

}
