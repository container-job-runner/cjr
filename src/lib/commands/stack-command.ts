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

export abstract class StackCommand extends Command
{
  private settings = new Settings(this.config.configDir, this.config.name)
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
    var result = new ValidatedOutput(true);
    if(hostRoot)
    {
      var stack = false
      var configFiles = []
      const yml_path = projectSettingsYMLPath(hostRoot)
      if(FileTools.existsFile(yml_path))
      {
          var stack_file = new YMLFile(false, false, ps_vo_validator)
          var read_result = stack_file.validatedRead(yml_path)
          if(read_result.success) {
            this.project_settings = { ...default_settings_object, ...read_result.data}
          } else {
            result.pushWarning(WarningStrings.PROJECTSETTINGS.INVALID_YML(yml_path))
          }

          if(this.project_settings?.configFiles) {
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
      }
    }
    this.handleFinalOutput(result)
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

  handleFinalOutput(result: ValidatedOutput)
  {
    result.warning.forEach( e => this.log(chalk`{bold.yellow WARNING}: ${e}`))
    result.error.forEach( e => this.log(chalk`{bold.red ERROR}: ${e}`))
  }

}
