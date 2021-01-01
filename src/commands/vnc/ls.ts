import chalk = require('chalk')
import { flags } from '@oclif/command'
import { ServiceCommand } from '../../lib/commands/service-command'
import { VNCService } from '../../lib/services/vnc-service'
import { ServiceInfo } from '../../lib/services/abstract/abstract-service'
import { JobManager } from '../../lib/job-managers/abstract/job-manager'

export default class List extends ServiceCommand {
  static description = 'List running VNC servers.'
  static args = []
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "explicit": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"resource": false})
    
    // -- service generator --------------------------------------------------
    const serviceGenerator = (job_manager : JobManager) => {
        return new VNCService( job_manager, {
            "resolution": this.settings.get('vnc-resolution'),
            "password": this.settings.get('vnc-password')
        })
    }

    // -- table data generator -----------------------------------------------
    const toDataRowArray = (si:ServiceInfo, _vs: VNCService) : [ string, string ] => [
        chalk`{green ${si["project-root"] || "none"}}`, 
        chalk`{underline vnc://${si['access-ip']}:${si['access-port']}}`
    ]
    
    // -- list request --------------------------------------------------------
    this.listService(
        serviceGenerator, toDataRowArray, flags
    )

  }

}
