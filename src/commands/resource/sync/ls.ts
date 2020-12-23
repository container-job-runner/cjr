import chalk = require('chalk')
import { flags } from '@oclif/command'
import { printValidatedOutput, printHorizontalTable, initizeSyncManager } from '../../../lib/functions/misc-functions'
import { ServiceInfo } from '../../../lib/services/abstract/AbstractService'
import { ServerCommand } from '../../../lib/commands/server-command'
import { printSyncManagerOutput } from '../../../lib/functions/cli-functions'

type ServiceState = "Running"|"Dead"
type ProcessedSyncServiceData = { [ key: string] : { "local": ServiceState, "remote": ServiceState} }

export default class List extends ServerCommand {
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
    if( ! sync_manager.absorb(list_request).success ) 
        return printSyncManagerOutput(list_request)
    
    if(flags["json"]) // -- json output ---------------------------------------
       return console.log(JSON.stringify(sync_manager.value(list_request)))

    const processed_data = this.combineServiceData(sync_manager.value(list_request))  
    // -- regular output ------------------------------------------------------
    const table_parameters = {
        row_headers:    ["PROJECT", "SERVICE-LOCAL", "SERVICE-REMOTE"],
        column_widths:  [17, 100],
        text_widths:    [15, 100],
        silent_clip:    [false, false]
    }
    const toArray = (key:keyof ProcessedSyncServiceData) => [ 
        chalk`{underline ${key}}`, 
        this.colorizeState(processed_data[key].local), 
        this.colorizeState(processed_data[key].remote) 
    ]
    printHorizontalTable({ ... table_parameters, ... {
      data: Object.keys(processed_data).map(toArray)
    }})
  }

  // output format helper functions

  combineServiceData(data: {"local" : ServiceInfo[], "remote": ServiceInfo[]}) : ProcessedSyncServiceData
  {
    const processed_data:ProcessedSyncServiceData = {}
    
    data.local.map((s:ServiceInfo) => {
        const project_root = s["project-root"]
        if( ! project_root ) return
        if( processed_data[project_root] == undefined )
            processed_data[project_root] = { "local" : "Running", "remote" : "Dead" }
        processed_data[project_root]["local"] = "Running"
    })
    data.remote.map((s:ServiceInfo) => {
        const project_root = s["project-root"]
        if( ! project_root ) return
        if( processed_data[project_root] == undefined )
            processed_data[project_root] = { "local" : "Dead", "remote" : "Running" }
        processed_data[project_root]["remote"] = "Running"    
    })

    return processed_data
  }

  colorizeState(state: ServiceState) : string
  {
    if (state == "Dead") 
        return chalk.red.bold(state)
    if (state == "Running") 
        return chalk.bold.green(state)
    return state
  }

}