import { flags } from '@oclif/command'
import { ResourceCommand } from '../../lib/commands/resource-command'
import { printVerticalTable, printHorizontalTable } from '../../lib/functions/misc-functions'
import { Resource } from '../../lib/config/resources/resource-configuration'
import { Dictionary } from '../../lib/constants'

export default class List extends ResourceCommand {
  static description = 'List all remote resources.'
  static args   = []
  static flags  = {
    "verbose": flags.boolean({default: false, char: 'v', description: "show all properties for each remote resource."})
  }
  static strict = true;

  async run() {
    const { flags } = this.parse(List)
    const resource_config:{[key:string]: Resource} = this.resource_configuration.getAllResources()
    const resource_names:Array<string> = Object.keys(resource_config)

    var table_parameters: Dictionary
    var toArray: (e: string) => Array<string>
    var printTable

    if(flags.verbose)  // -- Verbose Output ------------------------------------
    {
      table_parameters = {
          row_headers:    ["NAME", "ADDRESS", "USERNAME", "TYPE", "KEY", "OPTIONS"],
          column_widths:  [13, 103],
          text_widths:    [12, 102],
          silent_clip:    [true, true]
      }
      toArray = (name:string) => {
        const r = resource_config[name]
        return [name, r.address, r.username, r.type, r?.key || "", JSON.stringify(r['options'] || {})]
      }
      printTable = printHorizontalTable
    }
    else // -- Standard Output -------------------------------------------------
    {
      table_parameters = {
          column_headers: ["NAME", "ADDRESS", "USERNAME", "TYPE"],
          column_widths:  [18, 20, 15, 10],
          text_widths:    [15, 17, 12, 7],
          silent_clip:    [false, false, false, false, false]
      }

      toArray = (name:string) => {
        const r = resource_config[name]
        return [name, r.address, r.username, r.type]
      }
      printTable = printVerticalTable
    }

    printTable({ ...table_parameters, ...{
        title:  "Remote Resources",
        data:   resource_names.map((name:string) => toArray(name))
    }})






  }
}
