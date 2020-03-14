import * as chalk from 'chalk'
import * as fs from 'fs-extra'
import * as path from 'path'
import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {ProjectSettingsCommand, Dictionary} from '../../lib/commands/project-settings-command'
import {loadProjectSettings} from "../../lib/functions/run-functions"
import {project_settings_folder, projectSettingsYMLPath} from "../../lib/constants"
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {ProjectSettings, ps_fields, ps_props} from '../../config/project-settings/project-settings'

export default class Set extends ProjectSettingsCommand {
  static description = 'Set project settings'
  static args = [{}]
  static strict = false;

  async run()
  {
    const project_root = process.cwd();
    const {result, project_settings} = loadProjectSettings(project_root)
    if(result.success) // do nothing (project-settings directory already exists)
    {
      console.log("project-Settings directory already exists.")
    }
    else // create new project-settings directory
    {
      const project_settings_abspath = path.join(project_root, project_settings_folder)
      fs.ensureDirSync(project_settings_abspath)
      project_settings.set({'project-root': 'auto'})
      const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
      if(!result.success) return printResultState(result)
      console.log("project-Settings directory created.")
    }
  }
}
