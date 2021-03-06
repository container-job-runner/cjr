import * as fs from 'fs-extra'
import * as path from 'path'
import constants = require('../lib/constants')
import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../lib/commands/project-settings-command'
import { loadProjectSettings } from "../lib/functions/cli-functions"
import { cli_name, projectSettingsDirPath, projectSettingsYMLPath } from "../lib/constants"
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { ProjectSettings } from '../lib/config/project-settings/project-settings'
import { DockerStackConfiguration } from '../lib/config/stacks/docker/docker-stack-configuration'
import { TextFile } from '../lib/fileio/text-file'

export default class Init extends ProjectSettingsCommand {
  static description = 'Initialize a project in the current directory.'
  static args = []
  static flags = {
    "template": flags.string({default: 'default', options: ['empty', 'default', 'project-stacks']}),
    "stack": flags.string({env: 'CJR_STACK', description: "default stack for project"}),
    "project-root-auto": flags.boolean({}),
    "resource": flags.string({env: 'CJR_RESOURCE', description: "default resource for project"}),
    "stacks-dir": flags.string({description: "override default stack directory for project"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified, only these stacks will be visible when running cjr from within this project directory."}),
  }
  static strict = false;

  async run()
  {
    const {flags} = this.parse(Init)
    const project_root = process.cwd();
    const load_result = loadProjectSettings(project_root)
    if(load_result.success) // do nothing (project-settings directory already exists)
    {
      console.log("project-Settings directory already exists.")
    }
    else // create new project-settings directory
    {
      const project_settings = load_result.value;
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
      // -- add any user specified settings ------------------------------------
      if(flags['stack']) project_settings.setStack(flags['stack'])
      if(flags['resource']) project_settings.setResource(flags['resource'])
      if(flags['stacks-dir']) project_settings.setStacksDir(flags['stacks-dir'])
      if(flags['visible-stacks']) project_settings.setVisibleStacks(flags['visible-stacks'])
      if(flags['project-root-auto']) project_settings.setProjectRoot('auto')

      // -- write files --------------------------------------------------------
      const result = project_settings.writeToFile(projectSettingsYMLPath(project_root))
      if(!result.success) return printValidatedOutput(result)
      console.log(`Initialized cjr project in ${projectSettingsDirPath(project_root)}`)
      this.listProject(project_settings, project_root)
    }
  }

  emptyTemplate(project_settings: ProjectSettings, project_root: string)
  {
    project_settings.setProjectRoot('auto')
  }

  defaultTemplate(project_settings: ProjectSettings, project_root: string)
  {
    this.emptyTemplate(project_settings, project_root)
    const profile_name = 'default-include-exclude';
    project_settings.addDefaultProfile(profile_name)
    // -- create project-stack-config.yml file ---------------------------------
    const project_stack_config = new DockerStackConfiguration()
    project_stack_config.setRsyncUploadSettings({
      include: `../../.${cli_name}-upload-include`,
      exclude: `../../.${cli_name}-upload-exclude`
    })
    project_stack_config.setRsyncDownloadSettings({
      include: `../../.${cli_name}-download-include`,
      exclude: `../../.${cli_name}-download-exclude`
    })
    fs.mkdirpSync(constants.projectSettingsProfilePath(project_root))
    project_stack_config.save(
      constants.projectSettingsProfilePath(project_root),
      {'name': `${profile_name}.yml`}
    )
    // -- add .git .gitignore and .cjr to ignore file --------------------------
    const author = new TextFile(project_root)
    author.add_extension = false;
    author.write(
      `.${cli_name}-upload-exclude`,
      [
        '.cjr',
        '.cjr-upload-include',
        '.cjr-upload-exclude',
        '.cjr-download-include',
        '.cjr-download-exclude',
        '.git',
        '.gitignore'
      ].join("\n")
    )
  }

  projectStacksTemplate(project_settings: ProjectSettings, project_root: string)
  {
    this.defaultTemplate(project_settings, project_root)
    const project_stack_dirname = constants.project_settings.subdirectories.stacks
    project_settings.setStacksDir(project_stack_dirname)
    fs.ensureDirSync(path.join(projectSettingsDirPath(project_root), project_stack_dirname))
  }

}
