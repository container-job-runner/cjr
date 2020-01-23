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
import {ps_vo_validator} from './schema/project-settings-schema'
import {projectSettingsYMLPath} from '../constants'
import {FileTools} from '../fileio/file-tools'
import {YMLFile} from '../fileio/yml-file'
import {invalid_stack_flag_error, default_settings_object} from '../constants'
import {ValidatedOutput} from '../validated-output'
import {WarningStrings} from '../error-strings'
import {printResultState} from '../../lib/functions/misc-functions'

export abstract class StackCommand extends Command
{
  private settings = new Settings(this.config.configDir)
  private project_settings = {}

  fullStackPath(user_path: string) // leaves existant full path intact or generates full stack path from shortcut
  {
    return (fs.existsSync(user_path)) ? user_path : path.join(this.settings.get("stacks_path"), user_path)
  }

  parse(C, stack_required:boolean = false)// overload parse command to allow for auto setting of stack flag
  {
    const parse_object = super.parse(C)
    this.loadProjectSettingsYML(parse_object?.flags?.hostRoot)
    if(parse_object?.flags?.stack === false) {
        parse_object.flags.stack = this.project_settings?.stack || false
    }
    if(stack_required && !parse_object?.flags?.stack) this.error(invalid_stack_flag_error)
    return parse_object
  }

  // helper function for loading optional .cjr/stack.yml in hostRoot
  loadProjectSettingsYML(hostRoot)
  {
    // -- exit if no hostRoot is specified -------------------------------------
    if(!hostRoot) return;

    // -- exit if no settings file exists --------------------------------------
    const yml_path = projectSettingsYMLPath(hostRoot)
    if(!FileTools.existsFile(yml_path)) return

    // -- exit if settings file is invalid -------------------------------------
    const stack_file = new YMLFile(false, false, ps_vo_validator)
    const read_result = stack_file.validatedRead(yml_path)
    if(read_result.success == false) {
      printResultState(
        new ValidatedOutput(true, [], [], [WarningStrings.PROJECTSETTINGS.INVALID_YML(yml_path)])
      )
      return;
    }

    //  -- set project settings variable ---------------------------------------
    this.project_settings = { ...default_settings_object, ...read_result.data}
    var result = new ValidatedOutput(true)

    if(this.project_settings?.stack) // -- adjust stack paths ------------------
    {
      // see if local stack folder exists. If so set path to absolute
      const abs_path = path.join(path.dirname(yml_path), this.project_settings.stack)
      if(FileTools.existsDir(abs_path)) this.project_settings.stack = abs_path
    }

    if(this.project_settings?.configFiles) // -- adjust config files -----------
    {
      // adjust relative paths
      this.project_settings.configFiles = this.project_settings.configFiles.map(
       (path_str) => (path.isAbsolute(path_str)) ? path_str : path.join(path.dirname(yml_path), path_str)
      )
      // remove nonexistant configuration files
      this.project_settings.configFiles = this.project_settings.configFiles.filter(path => {
       let config_exists = FileTools.existsFile(path)
       if(!config_exists) result.pushWarning(WarningStrings.PROJECTSETTINGS.MISSING_CONFIG_FILE(yml_path, path))
       return config_exists
      })
    }

    printResultState(result)
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
