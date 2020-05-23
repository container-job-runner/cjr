import chalk = require('chalk')
import { BasicCommand } from '../../lib/commands/basic-command'
import { flags } from '@oclif/command'
import { printResultState, printHorizontalTable } from '../../lib/functions/misc-functions'
import { JupyterJobInfo, listJupyter } from '../../lib/functions/jupyter-functions'

export default class List extends BasicCommand {
  static description = 'List running jupiter servers.'
  static args = [{name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(List)
    const { job_manager } = this.initContainerSDK(false, false, flags['explicit'])
    const result = listJupyter(job_manager, "in-project")
    if(!result.success)
      return printResultState(result)

    if(flags["json"]) // -- json output ---------------------------------------
      return console.log(JSON.stringify(result.value))

    // -- regular output ------------------------------------------------------
    const table_parameters = {
        row_headers:    ["PROJECT", "URL"],
        column_widths:  [9, 100],
        text_widths:    [7, 100],
        silent_clip:    [true, false]
    }
    const toArray = (e:JupyterJobInfo) => [chalk`{green ${e["project-root"] || "none"}}`, chalk`{underline ${e.url}}`]
    printHorizontalTable({ ... table_parameters, ... {
      data: result.value.map(toArray)
    }})
  }

}