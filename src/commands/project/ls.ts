import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {ProjectSettingsCommand, Dictionary} from '../../lib/commands/project-settings-command'
import {loadProjectSettings} from "../../lib/functions/run-functions"
import {printResultState} from '../../lib/functions/misc-functions'

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
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = (flags["project-root"] as string)
    const load_result = loadProjectSettings(project_root)
    if(!load_result.success) return printResultState(load_result)
    this.printProjectSettings(load_result.value, project_root)
  }

}
