// ===========================================================================
// Project Settings Command: Abstract Class
// ===========================================================================

// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import Command from '@oclif/command'
import {StackCommand} from './stack-command'
import * as chalk from 'chalk'
import {Settings} from '../settings'
import {DockerBuildDriver} from '../drivers/docker/docker-build-driver'
import {PodmanBuildDriver} from '../drivers/podman/podman-build-driver'
import {BuildahBuildDriver} from '../drivers/buildah/buildah-build-driver'
import {DockerRunDriver} from '../drivers/docker/docker-run-driver'
import {PodmanRunDriver} from '../drivers/podman/podman-run-driver'
import {ShellCommand} from '../shell-command'
import {JSTools} from '../js-tools'
import {missingFlagError} from '../constants'
import {ValidatedOutput} from '../validated-output'
import {loadProjectSettings, scanForSettingsDirectory} from '../functions/run-functions'
import {ProjectSettings, ps_fields} from '../config/project-settings/project-settings'


// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}

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



// import StackCommand from './stack-command'
// import * as chalk from 'chalk'
//
// // -- types --------------------------------------------------------------------
// export type Dictionary = {[key: string]: any}
//
// export abstract class ProjectSettingsCommand extends StackCommand
// {
//   // printProjectSettings(project_settings: ProjectSettings)
//   // {
//   //   const raw_settings:Dictionary = project_settings.getMultiple(["project-root", "stack", "config-files", "stacks-dir", "remote-name", "visible-stacks"])
//   //   console.log(chalk`\n   {bold Project Settings}: ${flags['project-root']}\n`)
//   //   Object.keys(raw_settings).map((key:string) => {
//   //     const value = raw_settings[key]
//   //     let value_str = value
//   //     if(JSTools.isString(value))
//   //       value_str = chalk`{green ${value}}`
//   //     else if(JSTools.isArray(value))
//   //       value_str = `\n   - ${value.map((e:any) => chalk`{green ${e}}`).join('\n   - ')}`
//   //     console.log(chalk`   {italic ${key}}:`, value_str)
//   //   })
//   //   console.log()
//   // }
//
// }
