import chalk = require('chalk')
import { flags } from '@oclif/command'
import { printValidatedOutput, printHorizontalTable, initizeSyncManager } from '../../../lib/functions/misc-functions'
import { ServiceInfo } from '../../../lib/services/abstract/AbstractService'
import { ResourceCommand } from '../../../lib/commands/resource-command'
import { ValidatedOutput } from '../../../lib/validated-output'
import { ErrorStrings } from '../../../lib/error-strings'

export default class List extends ResourceCommand {
  static description = 'List running Syncthing servers.'
  static args  = [ { name: 'resource' } ]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags, args } = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"resource": false})
    // -- validate resource-----------------------------------------------------
    const resource_name = args["resource"] || flags["resource"] || ""
    const resource_request = this.getResourceWithKey(resource_name)
    if( ! resource_request.success )
        return printValidatedOutput(resource_request)
    
    const resource = resource_request.value

    // -- create sync manager --------------------------------------------------
    const sync_manager = initizeSyncManager(
        this.newJobManager('localhost', {verbose: false, quiet: false, explicit: flags['explicit']}),
        this.newJobManager(resource_name, {verbose: false, quiet: false, explicit: flags['explicit']}),
        { key: resource.key, username: resource.username, ip: resource.address },
        { listen: -1, connect: -1, gui: -1 }
    )
    
    // -- get running services ------------------------------------------------
    const list_request = sync_manager.list()
    if( ! list_request.success )
       return printValidatedOutput(list_request)

    if(flags["json"]) // -- json output ---------------------------------------
       return console.log(JSON.stringify(list_request.value))

    // -- regular output ------------------------------------------------------
    const table_parameters = {
        row_headers:    ["PROJECT"],
        column_widths:  [9],
        text_widths:    [7],
        silent_clip:    [true]
    }
    const toArray = (e:ServiceInfo) => [chalk`{green ${e["project-root"] || "none"}}`]
    printHorizontalTable({ ... table_parameters, ... {
      data: list_request.value["local"].map(toArray)
    }})
  }

}