// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import Command from '@oclif/command'
import { Settings } from '../settings'
import { DockerCliBuildDriver } from '../drivers/docker/docker-cli-build-driver'
import { PodmanCliBuildDriver } from '../drivers/podman/podman-cli-build-driver'
import { DockerSocketBuildDriver } from '../drivers/docker/docker-socket-build-driver'
import { PodmanSocketBuildDriver } from '../drivers/podman/podman-socket-build-driver'
import { BuildahBuildDriver } from '../drivers/buildah/buildah-build-driver'
import { DockerCliRunDriver } from '../drivers/docker/docker-cli-run-driver'
import { PodmanCliRunDriver } from '../drivers/podman/podman-cli-run-driver'
import { DockerSocketRunDriver } from '../drivers/docker/docker-socket-run-driver'
import { PodmanSocketRunDriver } from '../drivers/podman/podman-socket-run-driver'
import { ShellCommand } from '../shell-command'
import { JSTools } from '../js-tools'
import { missingFlagError, Dictionary } from '../constants'
import { ValidatedOutput } from '../validated-output'
import { loadProjectSettings, scanForSettingsDirectory } from '../functions/run-functions'
import { BuildOptions } from '../functions/build-functions'
import { ProjectSettings, ps_fields } from '../config/project-settings/project-settings'

export abstract class StackCommand extends Command
{
  protected settings = new Settings(this.config.configDir)

  // if user_path exists, returns user_path
  // if stack named user_paths exists in cli stack_path returns stacks_path/user_path
  // otherwise returns user_path
  fullStackPath(stack_name: string, stacks_path: string = "")
  {
    if(!stack_name) return ""
    if(!stacks_path) stacks_path = this.settings.get("stacks-dir");
    if(fs.existsSync(stack_name)) return path.resolve(stack_name)
    const local_stack_path = path.join(stacks_path, stack_name)
    if(fs.existsSync(local_stack_path)) return local_stack_path
    return stack_name
  }

  augmentFlagsWithHere(flags:Dictionary)
  {
    if(flags['here'] && !flags['project-root'])
      flags['project-root'] = process.cwd()
  }

  augmentFlagsWithProjectSettings(flags:Dictionary, flag_props: {[key in ps_fields]+?: boolean}) // overload parse command to allow for auto setting of stack flag
  {
    // -- exit if no-autoload flag is enabled ----------------------------------
    if(flags?.['no-autoload']) return flags
    // -- load settings and augment flags  -------------------------------------
    var load_result:ValidatedOutput<ProjectSettings>
    if(!flags?.['project-root'] && this.settings.get('auto-project-root'))
      load_result = scanForSettingsDirectory(process.cwd())
    else if(flags?.['project-root'])
      load_result = loadProjectSettings(flags['project-root'])
    else
      load_result = new ValidatedOutput(false, new ProjectSettings())

    // -- merge flags if load was successful -----------------------------------
    if(load_result.success) {
      const mergeable_fields:Array<ps_fields> = Object.keys(flag_props) as Array<ps_fields>
      JSTools.rMergeOnEmpty(
        flags,
        load_result.value.getMultiple(mergeable_fields))
    }
    // -- exit with error if required flags are missing ------------------------
    const required_flags = (Object.keys(flag_props) as Array<ps_fields>).filter((name:ps_fields) => flag_props[name])
    const missing_flags  = required_flags.filter((name:string) => !flags.hasOwnProperty(name))
    if(missing_flags.length != 0) this.error(missingFlagError(missing_flags))
    return flags
  }

  private equivStackPaths(path_a: string, path_b: string)
  {
    path_a = this.fullStackPath(path_a)
    path_b = this.fullStackPath(path_b)
    return (path.basename(path_a) == path.basename(path_b) && path.dirname(path_a) == path.dirname(path_b))
  }

  // ---------------------------------------------------------------------------
  // PARSELABELFLAG parses array of strings "key=value", and returns an array
  // of objects with key and value fields. Any malformed strings are ignored
  // -- Parameters -------------------------------------------------------------
  // raw_labels: Array<string> Array of raw label data. Each entry should
  // adhere to the format "key=value"
  // -- Returns ----------------------------------------------------------------
  //  Array<object> Each object has properties "key" and "value"
  // ---------------------------------------------------------------------------
  protected parseLabelFlag(raw_labels: Array<string>, message: string="")
  {
    const labels = []
    raw_labels.map((l:string) => {
      const split_index = l.search('=')
      if(split_index >= 1) labels.push({
        key: l.substring(0, split_index),
        value:l.substring(split_index + 1)
      })
    })
    if(message) labels.push({key: 'message', value: message})
    return labels
  }

  // ---------------------------------------------------------------------------
  // PARSEPORTFLAG parses array of strings "port:port" or "port", and returns
  // an array of objects with hostPort and containerPort fields. Any malformed
  // strings are ignored
  // -- Parameters -------------------------------------------------------------
  // raw_ports: Array<string> Array of raw label data. Each entry should
  // adhere to the format "port:port" or "port" where port is a positive integer
  // -- Returns ----------------------------------------------------------------
  //  Array<object> Each object has properties "hostPort" and "containerPort"
  // ---------------------------------------------------------------------------
  protected parsePortFlag(raw_ports: Array<string>) : Array<{address?: string, hostPort: number, containerPort: number}>
  {
    const ports:Array<{address?: string, hostPort: number, containerPort: number}> = []
    var regex_a = RegExp(/^\S*:\d+:\d+$/) // flag format: --port=address:hostPort:containerPort
    var regex_b = RegExp(/^\d+:\d+$/) // flag format: --port=hostPort:containerPort
    var regex_c = RegExp(/^\d+$/)     // flag format: --port=port
    raw_ports?.map(port_string => {
      if(regex_a.test(port_string)) {
        let p = port_string.split(':')
        ports.push({address: p[0], hostPort: parseInt(p[1]), containerPort: parseInt(p[2])})
      }
      if(regex_b.test(port_string)) {
        let p = port_string.split(':').map((e:string) => parseInt(e))
        ports.push({hostPort: p[0], containerPort: p[1]})
      }
      else if(regex_c.test(port_string)) {
        let p = parseInt(port_string)
        ports.push({hostPort: p, containerPort: p})
      }
    })
    return ports
  }

  // ---------------------------------------------------------------------------
  // PARSEBUILDMODEFLAG parses a string that represents the build mode. string
  // should be of the form:
  //  reuse-image
  //  cached         or     cached, pull
  //  uncached       or     uncached, pull
  // -- Parameters -------------------------------------------------------------
  // build_mode_str: string  - user specified flag value
  // -- Returns ----------------------------------------------------------------
  //  BuildOptions - object that can be used by build-functions
  // ---------------------------------------------------------------------------
  protected parseBuildModeFlag(build_mode_str: string)
  {
    const build_options:BuildOptions = {}
    const options = build_mode_str.split(',').map((s:string) => s.trim())
    if(options?.[0] == 'reuse-image')
      build_options['reuse-image'] = true;
    else if(options?.[0] == 'cached')
      build_options['no-cache'] = false;
    else if(options?.[0] == 'no-cache')
        build_options['no-cache'] = true;

    if(options?.[1] == 'pull')
      build_options['pull'] = true

    return build_options;
  }

  newBuilder(explicit: boolean = false, silent: boolean = false)
  {
    const shell = new ShellCommand(explicit, silent)
    const build_cmd = this.settings.get('build-cmd');
    const socket:string = this.settings.get('socket-path')

    switch(build_cmd)
    {
        case "docker":
        {
          return new DockerCliBuildDriver(shell);
        }
        case "docker-socket":
        {
          return new DockerSocketBuildDriver(shell, {socket: socket});
        }
        case "podman":
        {
          return new PodmanCliBuildDriver(shell);
        }
        case "podman-socket":
        {
          return new PodmanSocketBuildDriver(shell, {socket: socket});
        }
        case "buildah":
        {
          return new BuildahBuildDriver(shell);
        }
        default:
        {
          this.error("invalid build command")
        }
    }
  }

  newRunner(explicit: boolean = false, silent: boolean = false)
  {
    const shell = new ShellCommand(explicit, silent)
    const run_cmd = this.settings.get('run-cmd');
    const tag:string = this.settings.get('image-tag')
    const selinux:boolean = this.settings.get('selinux')
    const socket:string = this.settings.get('socket-path')

    switch(run_cmd)
    {
        case "docker":
        {
          return new DockerCliRunDriver(shell, {tag: tag, selinux: selinux});
        }
        case "docker-socket":
        {
          return new DockerSocketRunDriver(shell, {tag: tag, selinux: selinux, socket: socket});
        }
        case "podman":
        {
          return new PodmanCliRunDriver(shell, {tag: tag, selinux: selinux});
        }
        case "podman-socket":
        {
          return new PodmanSocketRunDriver(shell, {tag: tag, selinux: selinux, socket: socket});
        }
        default:
        {
          this.error("invalid run command")
        }
    }
  }

}
