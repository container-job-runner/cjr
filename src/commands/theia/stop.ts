import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ServerCommand } from '../../lib/commands/server-command'
import { TheiaService } from '../../lib/services/TheiaService'
import { ServiceInfo } from '../../lib/services/abstract/AbstractService'
import { RemoteSshJobManager } from '../../lib/job-managers/remote/remote-ssh-job-manager'

export default class Stop extends ServerCommand {
  static description = 'Stop a running Theia server.'
  static args = [ { name: "project-root" } ]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "resource": flags.string({env: 'RESOURCE'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "all": flags.boolean({description: "stop all jupyter servers running in host directories"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { args, flags } = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"project-root": false, "resource": false})
    this.augmentFlagsWithProjectRootArg(args, flags)
    this.augmentFlagsWithHere(flags)

    const job_manager = this.newJobManager(flags["resource"] || 'localhost', {
        verbose: flags['verbose'], 
        quiet: flags['quiet'], 
        explicit: flags['explicit']
    })

    const theia_service = new TheiaService(job_manager)
    const theia_identifier = (flags['all']) ? undefined : {"project-root": flags['project-root']}
    
    // -- release any tunnel ports ---------------------------------------------
    if( job_manager instanceof RemoteSshJobManager )
    {
        theia_service.list(theia_identifier).value.map( 
            (si: ServiceInfo) => this.releaseTunnelPort(job_manager, {"port": si.port}) 
        )
    } 

    printValidatedOutput(
        theia_service.stop(theia_identifier)
    )
  }

}
