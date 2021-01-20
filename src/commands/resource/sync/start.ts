import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { printSyncManagerOutput } from '../../../lib/functions/cli-functions'
import { ServiceCommand } from '../../../lib/commands/service-command'

export default class Start extends ServiceCommand {
    static description = 'Start a Syncthing server.'
    static args = [ { name: "resource" } ]
    static flags = {
        "resource": flags.string({env: 'CJR_RESOURCE'}),
        "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
        "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
        "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
        "quiet": flags.boolean({default: false, char: 'q'}),
        "debug": flags.boolean({default: false}),
        "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
    }
    static strict = true;

    async run()
    {
        const { flags, args } = this.parse(Start)
        this.augmentFlagsWithHere(flags)
        this.augmentFlagsWithProjectSettings(flags, {
            "resource": false,
            "project-root": false
        })
        this.augmentFlagsWithProjectRootArg(args, flags)
        
        const resource_name = args["resource"] || flags["resource"] || ""
        const project_root  = flags["project-root"] || ""
        const start_output  = await this.startSyncthing(project_root, resource_name, flags, {"stop-on-fail": true})
        
        printValidatedOutput(start_output)
        if(start_output.value != undefined)    
            printSyncManagerOutput(start_output.value)

    }

}
