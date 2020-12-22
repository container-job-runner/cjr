import { flags } from '@oclif/command'
import { printValidatedOutput, waitUntilSuccess } from '../../../lib/functions/misc-functions'
import { nextAvailablePorts } from '../../../lib/functions/cli-functions'
import { ServerCommand } from '../../../lib/commands/server-command'
import { initizeSyncManager } from '../../../lib/functions/misc-functions'

export default class Start extends ServerCommand {
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

        if( ! start_request.success ) 
            return printValidatedOutput(start_request)

        // -- validate service started properly ------------------------------------
        const ready_resquest = await waitUntilSuccess(
            () => sync_manager.ready(identifier),
            1000,
            5
        )

        if( ! ready_resquest.success ) 
            return printValidatedOutput(ready_resquest)

    }

}
