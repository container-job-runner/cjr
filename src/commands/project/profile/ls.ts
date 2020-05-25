import fs = require('fs')
import chalk = require('chalk')
import constants = require('../../../lib/constants')
import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../../lib/commands/project-settings-command'
import { FileTools } from '../../../lib/fileio/file-tools'

export default class ls extends ProjectSettingsCommand {
  static description = 'List all project settings.'
  static args = []
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT', description: "location where settings should be written"}),
  }
  static strict = true;

  async run()
  {
    const { flags } = this.parse(ls)
    this.augmentFlagsWithProjectSettings(flags, {"project-root": true})
    const project_profile_path = constants.projectSettingsProfilePath(flags["project-root"] || "")
    console.log(chalk`{bold PATH}      ${project_profile_path}`)
    process.stdout.write(chalk`{bold PROFILES}`)
    if(FileTools.existsDir(project_profile_path))
      fs.readdirSync(project_profile_path)
        .filter( (file_name: string) => /\.yml$/.test(file_name) )
        .map( (file_name: string, i: number) => process.stdout.write(`${(i == 0) ? "  " : "\n          "}${file_name.replace(/\.yml/, "")}`) )
    console.log("")
  }

}
