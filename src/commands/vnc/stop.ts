import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ServiceCommand } from '../../lib/commands/service-command'
import { VNCService } from '../../lib/services/vnc-service'
import { JobManager } from '../../lib/job-managers/abstract/job-manager'

export default class Stop extends ServiceCommand {
  static description = 'Stop a running VNC server.'
  static args = [ { name: "project-root" } ]
  static flags = {
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "all": flags.boolean({description: "stop all jupyter servers running in host directories"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "debug": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { args, flags } = this.parse(Stop)
    this.augmentFlagsForServiceStop(flags, args)

    // -- service generator ----------------------------------------------------
    const serviceGenerator = (job_manager : JobManager) => {
        return new VNCService( job_manager, {
            "resolution": this.settings.get('vnc-resolution'),
            "password": this.settings.get('vnc-password')
        })
    }

    // -- stop service ---------------------------------------------------------
    printValidatedOutput(
        this.stopService(serviceGenerator, flags)
    )
  }

}
