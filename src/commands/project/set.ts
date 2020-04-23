import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {ProjectSettingsCommand, Dictionary} from '../../lib/commands/project-settings-command'
import {loadProjectSettings} from "../../lib/functions/run-functions"
import {projectSettingsYMLPath} from "../../lib/constants"
import {printResultState} from '../../lib/functions/misc-functions'
import {ProjectSettings, ps_fields, ps_props} from '../../lib/config/project-settings/project-settings'

export default class Set extends ProjectSettingsCommand {
  static description = 'Set one or multiple project settings.'
  static args = []
  static flags = {
    "stack": flags.string({env: 'STACK', description: "default stack for project"}),
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "project-root-auto": flags.boolean({}),
    "remote-name": flags.string({env: 'REMOTENAME', description: "default remote resource for project"}),
    "config-files": flags.string({multiple: true, description: "additional overriding configuration files for project stack"}),
    "stacks-dir": flags.string({description: "override default stack directory for project"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {flags} = this.parse(Set)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = (flags["project-root"] as string)
    const project_settings = loadProjectSettings(project_root).data
    const fields:Array<ps_fields> = ['stack', 'remote-name', 'config-files', 'stacks-dir', 'visible-stacks']
    project_settings.set((JSTools.oSubset(flags, fields) as ps_props))
    if(flags['project-root-auto']) project_settings.set({'project-root': 'auto'})
    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printResultState(result)
    else if(!flags.quiet) this.printProjectSettings(project_settings, project_root)
  }

}
