import { flags } from '@oclif/command'
import { printValidatedOutput, waitUntilSuccess } from '../../../lib/functions/misc-functions'
import { nextAvailablePorts, printSyncManagerOutput } from '../../../lib/functions/cli-functions'
import { ServiceCommand } from '../../../lib/commands/service-command'
import { initizeSyncManager } from '../../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../../lib/validated-output'

export default class Start extends ServiceCommand {
    static description = 'Start a Syncthing server.'
    static args = [ { name: "resource" } ]
    static flags = {
        "resource": flags.string({env: 'CJR_RESOURCE'}),
        "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
        "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
        "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
        "quiet": flags.boolean({default: false, char: 'q'}),
        "explicit": flags.boolean({default: false}),
        "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
    }
    static strict = true;

    async run()
    {
        const { flags, args } = this.parse(Start)
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
        const local_manager = this.newJobManager('localhost', {verbose: flags['verbose'], quiet: flags['quiet'], explicit: flags['explicit']})
        const remote_manager = this.newJobManager(resource_name, {verbose: flags['verbose'], quiet: flags['quiet'], explicit: flags['explicit']})
        const ports = nextAvailablePorts(remote_manager.container_drivers, 20003, 3) // create function

        const sync_manager = initizeSyncManager(
            local_manager,
            remote_manager,
            { key: resource.key, username: resource.username, ip: resource.address },
            { listen: ports[0] || -1, connect: ports[1] || -1, gui: ports[2] || -1 }
        )

        // -- start sync service ---------------------------------------------------
        const identifier = {"project-root": flags['project-root']}
        const start_request = sync_manager.start(identifier, 
            {
                "project-root": flags["project-root"],
            }
        )

        // -- print output ----------------------------------------------------------
        if( ! sync_manager.absorb(start_request).success ) 
            return printSyncManagerOutput(start_request)

        // -- validate service started properly ------------------------------------
        let ready_output: { "local" : ValidatedOutput<{ output: string }> , "remote" : ValidatedOutput<{ output: string }> } | undefined = undefined
        const ready_request = await waitUntilSuccess(
            () => {
                ready_output = sync_manager.ready(identifier)
                return sync_manager.absorb(ready_output)
            },
            1000,
            5
        )

        if ( ! ready_request.success && ready_output !== undefined)
            return printSyncManagerOutput(ready_output)
        if( ! ready_request.success ) 
            return printValidatedOutput(ready_request)

    }

}
