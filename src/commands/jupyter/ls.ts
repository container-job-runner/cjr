import chalk = require('chalk')
import { flags } from '@oclif/command'
import { ServiceCommand } from '../../lib/commands/service-command'
import { JupyterService } from '../../lib/services/jupyter-service'
import { ServiceInfo } from '../../lib/services/abstract/abstract-service'
import { JobManager } from '../../lib/job-managers/abstract/job-manager'

export default class List extends ServiceCommand {
  static description = 'List running Jupyter servers.'
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
        return new JupyterService( job_manager, {
            "interface" : this.settings.get('jupyter-interface')
        })
    }

    // -- table data generator -----------------------------------------------
    const getToken = (si:ServiceInfo, js:JupyterService) => js.ready({"project-root": si["project-root"]}).value.token
    const toDataRowArray = (si:ServiceInfo, js: JupyterService) : [ string, string ] => [
        chalk`{green ${si["project-root"] || "none"}}`, 
        chalk`{underline http://${si["access-ip"]}:${si["access-port"]}/?token=${getToken(si, js)}}`
    ]
    
    // -- list request --------------------------------------------------------
    this.listService(
        serviceGenerator, toDataRowArray, flags
    )

  }

}
