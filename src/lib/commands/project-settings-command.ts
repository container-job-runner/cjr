// ===========================================================================
// Project Settings Command: Abstract Class
// ===========================================================================

import path = require('path')
import fs = require('fs-extra')
import chalk = require('chalk')
import constants = require('../constants')
import { BasicCommand } from './basic-command'
import { JSTools } from '../js-tools'
import { Dictionary } from '../constants'
import { ProjectSettings } from '../config/project-settings/project-settings'
import { FileTools } from '../fileio/file-tools'

export abstract class ProjectSettingsCommand extends BasicCommand
{

  listProject(project_settings: ProjectSettings, project_root: string)
  {
    const raw_settings:Dictionary = project_settings.get(["project-root", "stack", "stacks-dir", "resource", "visible-stacks"])
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
    // -- print default-profiles -----------------------------------------------
    const default_profiles = project_settings.getDefaultProfiles()
    const default_profiles_names = Object.keys(default_profiles || {});
    if( default_profiles && default_profiles_names.length > 0 ) {
      console.log(chalk`\n   {underline default-profiles:}`)
      default_profiles_names.map( (name: string, index: number) => {
        this.printKeyVal(name, default_profiles[name].includes(project_settings.profile_all_stacks_keyword) ? "ALL" : this.arrayToConsoleStr(default_profiles[name], 6), index + 1)
      })
    }
    console.log()
  }

  copyProfileToProjectSettings(config_path: string, project_root: string)
  {
    config_path = path.resolve(config_path)
    if(FileTools.existsFile(config_path) && project_root) {
      const local_dirname = constants.projectSettingsProfilePath(project_root)
      const local_filename = path.basename(config_path)
      fs.mkdirpSync(local_dirname) // ensure local config directory exists
      fs.copyFileSync(config_path, path.join(local_dirname, local_filename))
      return path.join(constants.project_settings.subdirectories.profiles, local_filename)
    }
    return ""
  }

  arrayToConsoleStr(a: Array<string>, ns:number = 3) {
    const spacer = " ".repeat(ns)

    if(a.length > 0)
      return `\n${spacer}- ${a.map((e:any) => chalk`{green ${e}}`).join(`\n${spacer}- `)}`
    return "[]"
  }

  stringToConsoleStr(s: string) {
    return chalk`{green ${s}}`
  }

  printKeyVal(key: string, value: string, index?: number) {
    const header = (index) ? `${index}. ` : ""
    console.log(chalk`   ${header}{italic ${key}}:`, value)
  }

}
