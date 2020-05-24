import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../../lib/commands/project-settings-command'
import { projectSettingsYMLPath} from "../../../lib/constants"
import { printResultState } from '../../../lib/functions/misc-functions'
import { loadProjectSettings } from '../../../lib/functions/cli-functions'

export default class Set extends ProjectSettingsCommand {
  static description = 'Overwrite one or multiple project settings.'
  static flags = {
    "stack": flags.string({env: 'STACK', description: "default stack for project"}),
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "project-root-auto": flags.boolean({}),
    "remote-name": flags.string({env: 'REMOTENAME', description: "default remote resource for project"}),
    "stacks-dir": flags.string({description: "override default stack directory for project"}),
    "config-files": flags.string({multiple: true}),
    "stack-selector": flags.string({multiple: true, dependsOn: ['config-file'], description: "config file will only apply to stacks matching this name"}),
    "copy-config": flags.boolean({dependsOn: ['config-files'], description: "copies config file into .cjr folder"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(Set)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = flags["project-root"] || ""
    const project_settings = loadProjectSettings(project_root).value

    if(flags['config-files']) project_settings.setConfigFiles(flags['config-files'])
    if(flags['visible-stacks']) project_settings.setVisibleStacks(flags['visible-stacks'])
    if(flags['stack']) project_settings.setStack(flags['stack'])
    if(flags['remote-name']) project_settings.setRemoteName(flags['remote-name'])
    if(flags['stacks-dir']) project_settings.setStacksDir(flags['stacks-dir'])
    if(flags['project-root-auto']) project_settings.setProjectRoot('auto')

    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printResultState(result)
    else if(!flags.quiet) this.listProject(project_settings, project_root)
  }

}