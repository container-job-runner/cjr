import { flags } from '@oclif/command'
import { ServiceCommand } from '../../../lib/commands/service-command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../../lib/validated-output'

export default class Stop extends ServiceCommand {
    static description = 'Manually stop any running ssh multiplexor used to tunnel service ports.'
    static args = [ { name: "resource" } ]
    static flags = {
        "resource": flags.string({env: 'CJR_RESOURCE'}),
        "debug": flags.boolean({default: false})
    }
    static strict = false;

    async run()
    {
        const { flags, args } = this.parse(Stop)
        this.augmentFlagsWithHere(flags)
        this.augmentFlagsWithProjectSettings(flags, {
            "resource": false,
        })

        const resource_name = args["resource"] || flags["resource"] || ""
        const job_manager  = this.newJobManager(
            resource_name,
            { "verbose": false, "quiet": false, "debug": flags['debug'] }
        )

        if( ! this.stopTunnel(job_manager) )
            printValidatedOutput(new ValidatedOutput(false, undefined)
                .pushError("Failed to stop tunnel.")
            )

    }

}