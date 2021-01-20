import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { ServiceCommand } from '../../../lib/commands/service-command'
import { printSyncManagerOutput } from '../../../lib/functions/cli-functions'

export default class Stop extends ServiceCommand {
    static description = 'Reset Syncthing persistant storage directories.'
    static args = [ { name: "resource" } ]
    static flags = {
        "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
        "resource": flags.string({env: 'CJR_RESOURCE'}),
        "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
        "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
        "quiet": flags.boolean({default: false, char: 'q'}),
        "debug": flags.boolean({default: false})
    }
    static strict = false;

    async run()
    {
        const { flags, args } = this.parse(Stop)
        this.augmentFlagsWithHere(flags)
        this.augmentFlagsWithProjectRootArg(args, flags)
        this.augmentFlagsWithProjectSettings(flags, {
            "resource": false,
            "project-root": true
        })

        if( ! flags["project-root"] )
            return // should never occur due to augmentFlagsWithProjectSettings

        const resource_name = args["resource"] || flags["resource"] || ""
        const reset_output   = this.resetSyncthing( 
            flags["project-root"],
            resource_name,
            flags
        )
            
        printValidatedOutput(reset_output)
        if(reset_output.value != undefined)        
            printSyncManagerOutput(reset_output.value)
    }

}
