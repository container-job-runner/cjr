import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../lib/commands/project-settings-command'
import { projectSettingsYMLPath} from "../../lib/constants"
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { loadProjectSettings } from '../../lib/functions/cli-functions'

export default class Remove extends ProjectSettingsCommand {
  static description = 'Removes one element of an array configuration property.'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'CJR_PROJECTROOT', description: "location where settings should be written"}),
    "default-profile": flags.string(),
    "stack": flags.string({ multiple: true, dependsOn: ['default-profile'], description: "profile will only activate for stacks matching this name. If this flag is not supplied, profile will apply to all stacks" }),
    "visible-stack": flags.string({ multiple: true }),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = true;

  async run()
  {
    const {flags} = this.parse(Remove)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = (flags["project-root"] as string)
    const project_settings = loadProjectSettings(project_root).value

    if(flags['default-profile']) // add a default profile
      project_settings.removeDefaultProfile(flags['default-profile'], flags['stack'])
    if(flags['visible-stack']) // add a visible stack
      project_settings.removeVisibleStacks(flags['visible-stack'])

    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printValidatedOutput(result)
    else if(!flags.quiet) this.listProject(project_settings, project_root)
  }

}
