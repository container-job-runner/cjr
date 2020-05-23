// ===========================================================================
// Project Settings Command: Abstract Class
// ===========================================================================

import path = require('path')
import fs = require('fs-extra')
import chalk = require('chalk')
import { BasicCommand } from './basic-command'
import { JSTools } from '../js-tools'
import { Dictionary } from '../constants'
import * as constants from '../constants'
import { ProjectSettings, StackSpecificConfiguration } from '../config/project-settings/project-settings'
import { FileTools } from '../fileio/file-tools'
import { TextFile } from '../fileio/text-file'

export abstract class ProjectSettingsCommand extends BasicCommand
{

  listProject(project_settings: ProjectSettings, project_root: string)
  {
    const raw_settings:Dictionary = project_settings.get(["project-root", "stack", "stacks-dir", "remote-name", "visible-stacks"])
    console.log(chalk`\n   {bold Project}: ${project_root}\n`)
    Object.keys(raw_settings).map((key:string) => {
      const value = raw_settings[key]
      let value_str = value
      if(JSTools.isString(value))
        value_str = this.stringToConsoleStr(value)
      else if(JSTools.isArray(value))
        value_str = this.arrayToConsoleStr(value)
      this.printKeyVal(key, value_str)
    })

    const relPathToAbsPath = (s:string) => (path.isAbsolute(s)) ? s : path.resolve(
      path.join(project_root, constants.project_settings.dirname, s)
    )
    // -- print config-files ---------------------------------------------------
    const abs_config_paths = project_settings.getConfigFiles()?.map(relPathToAbsPath) || []
    this.printKeyVal("config-files", this.arrayToConsoleStr(abs_config_paths))
    // -- print stack-specific-configurations ----------------------------------
    const SSCFS = project_settings.getStackSpecificConfigFiles()
    if( SSCFS ) {
      console.log(chalk`\n   {underline stack-specific-configurations:}\n`)
      SSCFS.map( (sscf: StackSpecificConfiguration, index: number) => {
        this.printKeyVal('file', relPathToAbsPath(sscf.path))
        this.printKeyVal('stacks', this.arrayToConsoleStr(sscf.stacks))
        if(index < SSCFS.length - 1) console.log()
      })
    }
    console.log()
  }

  copyConfigFile(config_path: string, project_root: string)
  {
    config_path = path.resolve(config_path)
    console.log(config_path)
    if(FileTools.existsFile(config_path) && project_root) {
      // -- set name of file to MD5 hash of contents
      const contents = new TextFile().read(config_path)
      const local_filename = JSTools.md5(contents.value || path.basename(config_path))
      const local_dirname = path.join(project_root, constants.project_settings.dirname, constants.project_settings.subdirectories.config)
      console.log(local_dirname)
      fs.mkdirpSync(local_dirname) // ensure local config directory exists
      fs.copyFileSync(config_path, path.join(local_dirname, local_filename))
      return path.join(constants.project_settings.subdirectories.config, local_filename)
    }
    return ""
  }

  arrayToConsoleStr(a: Array<string>) {
    if(a.length > 0)
      return `\n   - ${a.map((e:any) => chalk`{green ${e}}`).join('\n   - ')}`
    return "[]"
  }

  stringToConsoleStr(s: string) {
    return chalk`{green ${s}}`
  }

  printKeyVal(key: string, value: string) {
    console.log(chalk`   {italic ${key}}:`, value)
  }

}
