// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import Command from '@oclif/command'
import * as chalk from 'chalk'
import {Settings} from '../settings'
import {DockerBuildDriver} from '../drivers/docker/docker-build-driver'
import {PodmanBuildDriver} from '../drivers/podman/podman-build-driver'
import {BuildahBuildDriver} from '../drivers/buildah/buildah-build-driver'
import {DockerRunDriver} from '../drivers/docker/docker-run-driver'
import {PodmanRunDriver} from '../drivers/podman/podman-run-driver'
import {ShellCMD} from '../shellcmd'
import {FileTools} from '../fileio/file-tools'
import {YMLFile} from '../fileio/yml-file'
import {invalid_stack_flag_error} from '../constants'
import {ValidatedOutput} from '../validated-output'
import {WarningStrings} from '../error-strings'
import {printResultState} from '../../lib/functions/misc-functions'
import {loadProjectSettings} from '../../lib/functions/run-functions'

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}

export abstract class StackCommand extends Command
{
  protected settings = new Settings(this.config.configDir)
  protected project_settings:Dictionary = {}

  fullStackPath(user_path: string) // leaves existent full path intact or generates full stack path from shortcut
  {
    return (fs.existsSync(user_path)) ? user_path : path.join(this.settings.get("stacks_path"), user_path)
  }

  parseWithLoad(C:any, stack_flag_required:boolean = false)// overload parse command to allow for auto setting of stack flag
  {
    const parse_object:Dictionary = this.parse(C)
    const result = loadProjectSettings(parse_object?.flags?.hostRoot)
    printResultState(result)
    if(result.success) this.project_settings = result.data
    // if flags.stack is undefined set to project.settings.stack
    if(!parse_object?.flags?.stack && this.project_settings?.stack) {
         parse_object.flags.stack = this.project_settings.stack
    }
    // exit with error if flags.stack is empty and stack is required
    if(stack_flag_required && !parse_object?.flags?.stack) this.error(invalid_stack_flag_error)
    return parse_object
  }

  newBuilder(explicit: boolean = false, silent: boolean = false)
  {
    const build_cmd = this.settings.get('build_cmd');
    const tag = this.settings.get('image_tag');
    const shell = new ShellCMD(explicit, silent)

    switch(build_cmd)
    {
        case "docker":
        {
            return new DockerBuildDriver(shell, tag);
        }
        case "podman":
        {
            return new PodmanBuildDriver(shell, tag);
        }
        case "buildah":
        {
            return new BuildahBuildDriver(shell, tag);
        }
        default:
        {
          this.error("invalid build command")
        }
    }
  }

  newRunner(explicit: boolean = false, silent: boolean = false)
  {
    const run_cmd = this.settings.get('run_cmd');
    const tag = this.settings.get('image_tag');
    const shell = new ShellCMD(explicit, silent)

    switch(run_cmd)
    {
        case "docker":
        {
          return new DockerRunDriver(shell, tag);
        }
        case "podman":
        {
          return new PodmanRunDriver(shell, tag);
        }
        default:
        {
          this.error("invalid run command")
        }
    }
  }

}
