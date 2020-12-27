import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { ServiceCommand } from '../../../lib/commands/service-command'
import { printSyncManagerOutput } from '../../../lib/functions/cli-functions'

export default class Stop extends ServiceCommand {
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
            "project-root": false
        })
        this.augmentFlagsWithProjectRootArg(args, flags)

        const resource_name = args["resource"] || flags["resource"] || ""
        const stop_output   = this.stopSyncthing( 
            ( flags["all"] ) ? undefined : flags["project-root"] || "",
            resource_name,
            flags
        )
            
        printValidatedOutput(stop_output)
        if(stop_output.value != undefined)        
            printSyncManagerOutput(stop_output.value)
    }

}
