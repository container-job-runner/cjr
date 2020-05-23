import path = require('path')
import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../../lib/commands/project-settings-command'
import { projectSettingsYMLPath} from "../../../lib/constants"
import { printResultState } from '../../../lib/functions/misc-functions'
import { loadProjectSettings } from '../../../lib/functions/cli-functions'

export default class Set extends ProjectSettingsCommand {
  static description = 'Removes one element of an array configuration property.'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "config-file": flags.string(),
    "stack": flags.string({multiple: true, dependsOn: ['config-file'], description: "config file will only apply to stacks matching this name. If this flag is not supplied, config will apply to all stacks"}),
    "visible-stack": flags.string({multiple: true}),
    "copy-config": flags.boolean({dependsOn: ['config-file'], description: "copies config file into .cjr folder"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {flags} = this.parse(Set)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = (flags["project-root"] as string)
    const project_settings = loadProjectSettings(project_root).value

    // -- add any configuration files ------------------------------------------
    if(flags['config-file']) {
      const config_file = path.resolve(flags['config-file'])
      if(flags["stack"])
        project_settings.removeStackSpecificConfigFile(config_file, flags['stack'])
      else
        project_settings.removeConfigFile(config_file)
    }
    if(flags['visible-stack']) project_settings.removeVisibleStacks(flags['visible-stack'])

    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printResultState(result)
    else if(!flags.quiet) this.listProject(project_settings, project_root)
  }

}
