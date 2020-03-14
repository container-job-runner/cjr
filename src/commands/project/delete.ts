import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {ProjectSettingsCommand, Dictionary} from '../../lib/commands/project-settings-command'
import {loadProjectSettings} from "../../lib/functions/run-functions"
import {projectSettingsYMLPath} from "../../lib/constants"
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {ProjectSettings, ps_fields, ps_props} from '../../lib/config/project-settings/project-settings'

export default class Delete extends ProjectSettingsCommand {
  static description = 'Set project settings'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "stack": flags.boolean({description: "remove default stack for project"}),
    "project-root-auto": flags.boolean({description: "remove auto load for project"}),
    "remote-name": flags.boolean({env: 'REMOTENAME', description: "remote remote resource for project"}),
    "config-files": flags.boolean({description: "remove any additional overriding configuration files for project stack"}),
    "stacks-dir": flags.boolean({description: "remove any overriding default stack directory for project"}),
    "visible-stacks": flags.boolean({description: "if specified only these stacks will be affected by this command"}),
  }
  static strict = false;

  async run()
  {
    const {flags} = this.parse(Delete)
    // -- load project root from project settings files ------------------------
    const prflag = this.augmentFlagsWithProjectSettings(
      JSTools.oSubset(flags, ['project-root']),
      {"project-root":true}
    )
    const project_root:string = (prflag['project-root'] as string)
    // -------------------------------------------------------------------------
    const {project_settings} = loadProjectSettings(project_root)
    const fields:Array<ps_fields> = ['stack', 'remote-name', 'config-files', 'stacks-dir', 'visible-stacks']
    const fields_to_delete:Array<ps_fields> = (Object.keys(JSTools.oSubset(flags, fields)) as Array<ps_fields>)
    fields_to_delete.map((field:ps_fields) => project_settings.remove(field))
    if(flags['project-root-auto']) project_settings.remove('project-root')
    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printResultState(result)
    else this.printProjectSettings(project_settings, project_root)
  }

}
