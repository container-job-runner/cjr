import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../../lib/commands/project-settings-command'
import { projectSettingsYMLPath} from "../../../lib/constants"
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { loadProjectSettings } from '../../../lib/functions/cli-functions'

export default class Set extends ProjectSettingsCommand {
  static description = 'Overwrite one or multiple project settings.'
  static flags = {
    "stack": flags.string({env: 'STACK', description: "default stack for project"}),
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "project-root-auto": flags.boolean({}),
    "resource": flags.string({env: 'RESOURCE', description: "default resource for project"}),
    "stacks-dir": flags.string({description: "override default stack directory for project"}),
    "config-files": flags.string({multiple: true}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = true;

  async run()
  {
    const { flags } = this.parse(Set)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = flags["project-root"] || ""
    const project_settings = loadProjectSettings(project_root).value

    if(flags['config-files']) project_settings.setConfigFiles(flags['config-files'])
    if(flags['visible-stacks']) project_settings.setVisibleStacks(flags['visible-stacks'])
    if(flags['stack']) project_settings.setStack(flags['stack'])
    if(flags['resource']) project_settings.setResource(flags['resource'])
    if(flags['stacks-dir']) project_settings.setStacksDir(flags['stacks-dir'])
    if(flags['project-root-auto']) project_settings.setProjectRoot('auto')

    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printValidatedOutput(result)
    else if(!flags.quiet) this.listProject(project_settings, project_root)
  }

}
