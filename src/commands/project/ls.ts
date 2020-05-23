import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../lib/commands/project-settings-command'
import { printResultState } from '../../lib/functions/misc-functions'
import { loadProjectSettings } from '../../lib/functions/cli-functions'

export default class ls extends ProjectSettingsCommand {
  static description = 'List all project settings.'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
  }
  static strict = true;

  async run()
  {
    const {flags} = this.parse(ls)
    this.augmentFlagsWithProjectSettings(flags, {"project-root": true})
    const project_root: string = (flags["project-root"] as string)
    const load_result = loadProjectSettings(project_root)
    if(!load_result.success) return printResultState(load_result)
    this.listProject(load_result.value, project_root)
  }

}
