import { flags } from '@oclif/command'
import { JSTools } from '../../lib/js-tools'
import { ProjectSettingsCommand}  from '../../lib/commands/project-settings-command'
import { projectSettingsYMLPath, Dictionary } from "../../lib/constants"
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ps_prop_keys } from '../../lib/config/project-settings/project-settings'
import { loadProjectSettings } from '../../lib/functions/cli-functions'

export default class Delete extends ProjectSettingsCommand {
  static description = 'Remove one or more project settings.'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'CJR_PROJECTROOT', description: "location where settings should be written"}),
    "stack": flags.boolean({description: "remove default stack for project"}),
    "project-root-auto": flags.boolean({description: "remove auto load for project"}),
    "resource": flags.boolean({env: 'CJR_RESOURCE', description: "remove default resource for project"}),
    "default-profiles": flags.boolean({description: "remove all additional overriding configuration files for project stack"}),
    "stacks-dir": flags.boolean({description: "remove any overriding default stack directory for project"}),
    "visible-stacks": flags.boolean({description: "if specified only these stacks will be affected by this command"}),
    "quiet": flags.boolean({default: false, char: 'q'})
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
    const project_settings = loadProjectSettings(project_root).value
    const fields:Array<ps_prop_keys> = ['stack', 'resource', 'resource', 'stacks-dir', 'visible-stacks', 'default-profiles']
    fields.map( ( prop: ps_prop_keys ) => {
      if((flags as Dictionary)?.[prop] === true) project_settings.remove(prop)
    })
    if(flags['project-root-auto']) project_settings.remove('project-root')
    const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
    if(!result.success) return printValidatedOutput(result)
    else if(!flags.quiet) this.listProject(project_settings, project_root)
  }

}
