import * as chalk from 'chalk'
import * as fs from 'fs-extra'
import * as path from 'path'
import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {ProjectSettingsCommand, Dictionary} from '../../lib/commands/project-settings-command'
import {loadProjectSettings} from "../../lib/functions/run-functions"
import {cli_name, projectSettingsDirPath, projectSettingsYMLPath} from "../../lib/constants"
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {ProjectSettings} from '../../lib/config/project-settings/project-settings'
import {DockerStackConfiguration} from '../../lib/config/stacks/docker/docker-stack-configuration'
import {TextFile} from '../../lib/fileio/text-file'

export default class Init extends ProjectSettingsCommand {
  static description = 'Set project settings'
  static args = []
  static flags = {
    template: flags.string({default: 'default', options: ['empty', 'default', 'project-stacks']})
  }
  static strict = false;

  async run()
  {
    const {flags} = this.parse(Init)
    const project_root = process.cwd();
    const {result, project_settings} = loadProjectSettings(project_root)
    if(result.success) // do nothing (project-settings directory already exists)
    {
      console.log("project-Settings directory already exists.")
    }
    else // create new project-settings directory
    {
      fs.ensureDirSync(projectSettingsDirPath(project_root))
      switch (flags.template)
      {
        case "empty":
          this.emptyTemplate(project_settings, project_root)
          break
        case "default":
          this.defaultTemplate(project_settings, project_root)
          break
        case "project-stacks":
          this.projectStacksTemplate(project_settings, project_root)
          break
      }
      const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
      if(!result.success) return printResultState(result)
      console.log(`Initialized cjr project in ${projectSettingsDirPath(project_root)}`)
    }
  }

  emptyTemplate(project_settings: ProjectSettings, project_root: string)
  {
    project_settings.set({'project-root': 'auto'})
  }

  defaultTemplate(project_settings: ProjectSettings, project_root: string)
  {
    this.emptyTemplate(project_settings, project_root)
    const project_config_name = 'project-stack-config.yml';
    project_settings.set({'config-files': [project_config_name]})
    // -- create project-stack-config.yml file ---------------------------------
    const project_stack_config = new DockerStackConfiguration()
    project_stack_config.setRsyncUploadSettings({
      include: `../.${cli_name}-upload-include`,
      exclude: `../.${cli_name}-upload-ignore`
    })
    project_stack_config.setRsyncDownloadSettings({
      include: `../.${cli_name}-download-include`,
      exclude: `../.${cli_name}-download-exclude`
    })
    project_stack_config.writeToFile(
      path.join(projectSettingsDirPath(project_root), project_config_name))
    // -- add .git .gitignore and .cjr to ignore file --------------------------
    const author = new TextFile(project_root)
    author.add_extension = false;
    author.write(`.${cli_name}-upload-ignore`, ".cjr\n.git\n.gitignore")
  }

  projectStacksTemplate(project_settings: ProjectSettings, project_root: string)
  {
    this.defaultTemplate(project_settings, project_root)
    const project_stack_dirname = 'project-stacks';
    project_settings.set({'stacks-dir': project_stack_dirname})
    fs.ensureDirSync(path.join(projectSettingsDirPath(project_root), project_stack_dirname))
  }

}
