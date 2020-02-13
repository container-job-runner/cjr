// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import Command from '@oclif/command'
import * as chalk from 'chalk'
import {Settings} from '../settings'
import {JSTools} from '../js-tools'
import {Configuration} from '../config/abstract/configuration'
import {DockerBuildDriver} from '../drivers/docker/docker-build-driver'
import {PodmanBuildDriver} from '../drivers/podman/podman-build-driver'
import {BuildahBuildDriver} from '../drivers/buildah/buildah-build-driver'
import {DockerRunDriver} from '../drivers/docker/docker-run-driver'
import {PodmanRunDriver} from '../drivers/podman/podman-run-driver'
import {ShellCommand} from '../shell-command'
import {FileTools} from '../fileio/file-tools'
import {YMLFile} from '../fileio/yml-file'
import {missingFlagError} from '../constants'
import {ValidatedOutput} from '../validated-output'
import {WarningStrings} from '../error-strings'
import {printResultState} from '../../lib/functions/misc-functions'
import {loadProjectSettings, scanForSettingsDirectory} from '../../lib/functions/run-functions'

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}

export abstract class StackCommand extends Command
{
  protected settings = new Settings(this.config.configDir)

  fullStackPath(user_path: string) // leaves existent full path intact or generates full stack path from shortcut
  {
    return (fs.existsSync(user_path)) ? user_path : path.join(this.settings.get("stacks_path"), user_path)
  }

  parseWithLoad(C:any, flag_props: {[key: string]: boolean}) // overload parse command to allow for auto setting of stack flag
  {
    const parse_object:Dictionary = this.parse(C)
    // -- exit if no-autoload flag is enabled ----------------------------------
    if(parse_object.flags?.['no-autoload']) return parse_object
    // -- load settings and augment flags  -------------------------------------
    const flags = parse_object.flags
    var result = new ValidatedOutput(false)
    if(!flags?.hostRoot && this.settings.get('auto_hostroot'))
      result = scanForSettingsDirectory(process.cwd())
    else if(!flags?.hostRoot)
      result = loadProjectSettings(parse_object.flags.hostRoot)
    // -- merge flags if load was successful -----------------------------------
    if(result.success) {
      var mergeable_fields = Object.keys(flag_props)
      // do not load project configFiles if user manually specifies another stack (See github issue #38).
      if(flags.stack && this.fullStackPath(flags.stack) != this.fullStackPath(result.data.stack || ""))
        mergeable_fields = mergeable_fields.filter((e:string) => e != 'configFiles')
      // merge
      parse_object.flags = {
        ...JSTools.oSubset(result.data, mergeable_fields),
        ...parse_object.flags
      }
    }
    // -- exit if required flags are missing -----------------------------------
    const required_flags = Object.keys(flag_props).filter((name:string) => flag_props[name])
    const missing_flags  = required_flags.filter((name:string) => !parse_object.flags.hasOwnProperty(name))
    if(missing_flags.length != 0) this.error(missingFlagError(missing_flags))
    return parse_object
  }

  newBuilder(explicit: boolean = false, silent: boolean = false)
  {
    const build_cmd = this.settings.get('build_cmd');
    const tag = this.settings.get('image_tag');
    const shell = new ShellCommand(explicit, silent)

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
    const shell = new ShellCommand(explicit, silent)
    const options = {
      tag: this.settings.get('image_tag'),
      selinux: this.settings.get('selinux')
    }

    switch(run_cmd)
    {
        case "docker":
        {
          return new DockerRunDriver(shell, options);
        }
        case "podman":
        {
          return new PodmanRunDriver(shell, options);
        }
        default:
        {
          this.error("invalid run command")
        }
    }
  }

  addLabelFlagsToConfiguration(configuration: Configuration, label_flags: Array<string>)
  {
    label_flags.map((label_flag:string) => {
      const label_object = this.parseLabelFlag(label_flag)
      if(label_object !== false) configuration.addLabel(label_object.key, label_object.value)
    })
  }
  // parses a string of the form key=value and returns key and value in Object
  // or false of the string is malfomed
  private parseLabelFlag(label_flag: string)
  {
    const split_index = label_flag.search('=')
    if(split_index < 1) return false
    else return {
      key: label_flag.substring(0, split_index),
      value:label_flag.substring(split_index + 1)
    }
  }

}
