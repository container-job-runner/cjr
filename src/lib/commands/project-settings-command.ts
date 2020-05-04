// ===========================================================================
// Project Settings Command: Abstract Class
// ===========================================================================

import { StackCommand } from './stack-command'
import * as chalk from 'chalk'
import { JSTools } from '../js-tools'
import { Dictionary } from '../constants'
import { ProjectSettings } from '../config/project-settings/project-settings'

export abstract class ProjectSettingsCommand extends StackCommand
{
    printProjectSettings(project_settings: ProjectSettings, project_root: string)
    {
      const raw_settings:Dictionary = project_settings.getMultiple(["project-root", "stack", "config-files", "stacks-dir", "remote-name", "visible-stacks"])
      console.log(chalk`\n   {bold Project}: ${project_root}\n`)
      Object.keys(raw_settings).map((key:string) => {
        const value = raw_settings[key]
        let value_str = value
        if(JSTools.isString(value))
          value_str = chalk`{green ${value}}`
        else if(JSTools.isArray(value))
          value_str = `\n   - ${value.map((e:any) => chalk`{green ${e}}`).join('\n   - ')}`
        console.log(chalk`   {italic ${key}}:`, value_str)
      })
      console.log()
    }
}
