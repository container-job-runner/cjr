import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../../lib/commands/project-settings-command'
import { projectSettingsYMLPath} from "../../../lib/constants"
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { loadProjectSettings } from '../../../lib/functions/cli-functions'

export default class Set extends ProjectSettingsCommand {
  static description = 'Removes one element of an array configuration property.'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
    "config-file": flags.string({ description: "manually remove a path to a config file" }),
    "default-profile": flags.string(),
    "stack": flags.string({ multiple: true, dependsOn: ['default-profile'], description: "profile will only activate for stacks matching this name. If this flag is not supplied, profile will apply to all stacks" }),
    "visible-stack": flags.string({ multiple: true }),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {flags} = this.parse(Set)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = (flags["project-root"] as string)
    const project_settings = loadProjectSettings(project_root).value

    if(flags['default-profile']) // add a default profile
      project_settings.removeDefaultProfile(flags['default-profile'], flags['stack'])
    if(flags['config-file'])
      project_settings.removeConfigFile(flags['config-file'])
    if(flags['visible-stack']) // add a visible stack
      project_settings.removeVisibleStacks(flags['visible-stack'])

    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printValidatedOutput(result)
    else if(!flags.quiet) this.listProject(project_settings, project_root)
  }

}
