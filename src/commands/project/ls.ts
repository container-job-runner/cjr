import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {ProjectSettingsCommand, Dictionary} from '../../lib/commands/project-settings-command'
import {loadProjectSettings} from "../../lib/functions/run-functions"
import {printResultState} from '../../lib/functions/misc-functions'

export default class ls extends ProjectSettingsCommand {
  static description = 'list project settings'
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
    const {result, project_settings} = loadProjectSettings(project_root)
    if(!result.success) return printResultState(result)
    this.printProjectSettings(project_settings, project_root)
  }

}
