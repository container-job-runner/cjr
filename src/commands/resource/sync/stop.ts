import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { ServerCommand } from '../../../lib/commands/server-command'
import { initizeSyncManager } from '../../../lib/functions/misc-functions'

export default class Stop extends ServerCommand {
  static description = 'Stop a running Syncthing server.'
  static args = [ { name: "resource" } ]
  static flags = {
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "all": flags.boolean({description: "stop all jupyter servers running in host directories"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags, args } = this.parse(Stop)
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {
      "resource": false,
      "project-root":false
    })
    this.augmentFlagsWithProjectRootArg(args, flags)
    // -- validate project root ------------------------------------------------
    const pr_check = this.validProjectRoot(flags['project-root'], false) // add parameter allow empty
    if(!pr_check.success)
        return printValidatedOutput(pr_check)
    
    // -- validate resource-----------------------------------------------------
    const resource_name = args["resource"] || flags["resource"] || ""
    const resource_request = this.getResourceWithKey(resource_name)
    if( ! resource_request.success )
        return printValidatedOutput(resource_request)
    
    const resource = resource_request.value

    // -- create sync manager --------------------------------------------------
    const local_manager = this.newJobManager('localhost', {verbose: false, quiet: false, explicit: flags['explicit']})
    const remote_manager = this.newJobManager(resource_name, {verbose: false, quiet: false, explicit: flags['explicit']})
    const sync_manager  = initizeSyncManager(
        local_manager,
        remote_manager,
        { key: resource.key, username: resource.username, ip: resource.address },
        { listen: -1, connect: -1, gui: -1 }
    )
    
    // -- stop service ----------------------------------------------------------
    const start_request = sync_manager.stop(
        {"project-root": flags['project-root']}, 
        {local: false, remote: false}
    )

    if( ! start_request.success ) 
        return printValidatedOutput(start_request)
  }

}
