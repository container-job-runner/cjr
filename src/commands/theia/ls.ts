import chalk = require('chalk')
import { flags } from '@oclif/command'
import { ServiceCommand } from '../../lib/commands/service-command'
import { TheiaService } from '../../lib/services/theia-service'
import { ServiceInfo } from '../../lib/services/abstract/abstract-service'
import { JobManager } from '../../lib/job-managers/abstract/job-manager'

export default class List extends ServiceCommand {
  static description = 'List running Theia servers.'
  static args = []
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "debug": flags.boolean({default: false}),
    "json": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"resource": false})
    
    // -- service generator --------------------------------------------------
    const serviceGenerator = (job_manager : JobManager) => {
        return new TheiaService( job_manager, {
            "start-timeout": Math.max(0, parseFloat(this.settings.get('timeout-theia'))) || undefined
        })
    }

    // -- table data generator -----------------------------------------------
    const toDataRowArray = (si:ServiceInfo, _ts: TheiaService) : [ string, string ] => [
        chalk`{green ${si["project-root"] || "none"}}`, 
        chalk`{underline http://${si["access-ip"]}:${si["access-port"]}}`
    ]
    
    // -- list request --------------------------------------------------------
    this.listService(
        serviceGenerator, toDataRowArray, flags
    )

  }

}
