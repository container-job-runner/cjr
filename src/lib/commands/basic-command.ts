// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import fs = require('fs')
import path = require('path')
import constants = require('../constants')
import Command from '@oclif/command'
import { Settings } from '../settings'
import { DockerCliBuildDriver } from '../drivers-containers/docker/docker-cli-build-driver'
import { PodmanCliBuildDriver } from '../drivers-containers/podman/podman-cli-build-driver'
import { DockerSocketBuildDriver } from '../drivers-containers/docker/docker-socket-build-driver'
import { PodmanSocketBuildDriver } from '../drivers-containers/podman/podman-socket-build-driver'
import { DockerCliRunDriver } from '../drivers-containers/docker/docker-cli-run-driver'
import { PodmanCliRunDriver } from '../drivers-containers/podman/podman-cli-run-driver'
import { DockerSocketRunDriver } from '../drivers-containers/docker/docker-socket-run-driver'
import { PodmanSocketRunDriver } from '../drivers-containers/podman/podman-socket-run-driver'
import { ShellCommand } from '../shell-command'
import { JSTools } from '../js-tools'
import { missingFlagError, Dictionary } from '../constants'
import { ValidatedOutput } from '../validated-output'
import { ProjectSettings, ps_prop_keys } from '../config/project-settings/project-settings'
import { BuildDriver } from '../drivers-containers/abstract/build-driver'
import { RunDriver, JobState } from '../drivers-containers/abstract/run-driver'
import { ExecConstructorOptions, ExecConfiguration } from '../config/exec/exec-configuration'
import { Configurations, ContainerDrivers, OutputOptions, JobManager } from '../job-managers/job-manager'
import { DockerStackConfiguration } from '../config/stacks/docker/docker-stack-configuration'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { DockerJobConfiguration } from '../config/jobs/docker-job-configuration'
import { ErrorStrings } from '../error-strings'
import { printResultState } from '../functions/misc-functions'
import { RunShortcuts } from '../config/run-shortcuts/run-shortcuts'
import { LocalJobManager } from '../job-managers/local-job-manager'
import { scanForSettingsDirectory, loadProjectSettings, promptUserForJobId, socketExists, startPodmanSocket } from '../functions/cli-functions'

export type ContainerSDK = {
  "output_options": OutputOptions
  "configurations": Configurations,
  "container_drivers": ContainerDrivers,
  "job_manager": JobManager
}

export type ProjectSettingsFlags = "project-root" | "stack" | "stacks-dir" | "remote-name" | "visible-stacks" | "config-files" | "profile"

export abstract class BasicCommand extends Command
{
  protected settings = new Settings(this.config.configDir, this.config.dataDir, this.config.cacheDir)
  private podman_socket_started: boolean = false

  // helper functions for exec commands that require id
  async getJobIds( argv: Array<string>, flags: {'visible-stacks': Array<string>, 'stacks-dir': string, 'explicit': boolean} , states?: Array<JobState>) : Promise<string[]|false>
  {
    const non_empty_ids = argv.filter((id:string) => id !== "")
    if(non_empty_ids.length > 0)
      return non_empty_ids
    else if(this.settings.get('interactive'))
    {
      const visible_stack_paths = this.extractVisibleStacks(flags)
      const { container_drivers } = this.initContainerSDK(false, false, flags['explicit'])
      const id = await promptUserForJobId(container_drivers, visible_stack_paths, states, false)
      if(!id) return false
      return [id]
    }
    else
      return false
  }

  async getJobId(argv: Array<string>, flags: {'visible-stacks': Array<string>, 'stacks-dir': string, 'explicit': boolean},  states?: Array<JobState>) : Promise<string|false>
  {
    const ids = await this.getJobIds(argv, flags, states)
    if(ids === false) return false
    return ids?.shift() || false
  }

  // ===========================================================================
  // Flag Augment Functions
  // ===========================================================================

  augmentFlagsWithHere(flags:Dictionary)
  {
    if(flags['here'] && !flags['project-root'])
      flags['project-root'] = process.cwd()
  }

  augmentFlagsWithProjectSettings(flags:Dictionary, flag_props: {[key in ProjectSettingsFlags]?: boolean}) // overload parse command to allow for auto setting of stack flag
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
      const project_settings = load_result.value
      const valid_keys: Array<ps_prop_keys> = ["project-root", "stack", "stacks-dir", "remote-name", "visible-stacks"]
      const mergeable_fields:Array<ps_prop_keys> = Object.keys(flag_props).filter((key:string) => valid_keys.includes(key as ps_prop_keys)) as Array<ps_prop_keys>
      const project_flags:Dictionary = project_settings.get(mergeable_fields)
      if(flag_props['config-files'] !== undefined)
        project_flags['config-files'] = project_settings.processedConfigFiles()
      if(flag_props['profile'] !== undefined)
        flags['profile'] = project_settings.getActiveProfiles(flags['stack'] || project_flags['stack'] || "")
      JSTools.rMergeOnEmpty(flags, project_flags)
    }
    // -- exit with error if required flags are missing ------------------------
    const required_flags = (Object.keys(flag_props) as Array<ProjectSettingsFlags>).filter((name:ProjectSettingsFlags) => flag_props[name])
    const missing_flags  = required_flags.filter((name:string) => !flags.hasOwnProperty(name))
    if(missing_flags.length != 0) this.error(missingFlagError(missing_flags))
    return flags
  }

  // ===========================================================================
  // Stack Configuration Loading Functions
  // ===========================================================================


  fullStackPath(stack_name: string, stacks_path: string = "")
  {
    if(!stack_name) return ""
    if(!stacks_path) stacks_path = this.settings.get("stacks-dir");
    if(fs.existsSync(stack_name)) return path.resolve(stack_name)
    const local_stack_path = path.join(stacks_path, stack_name)
    if(fs.existsSync(local_stack_path)) return local_stack_path
    return stack_name
  }

  // if flags['stack'] exists, load from this location
  // if stack named flags['stack'] exists in stacks-dir, then load from stacks-path/flags['stack']
  // otherwise assume stack is referencing an image
  initStackConfiguration(flags: {"stack"?: string, "stacks-dir"?: string, "config-files"?: Array<string>}, configurations: Configurations) : ValidatedOutput<StackConfiguration<any>>
  {
    const stack_configuration = configurations.stack()
    const result = new ValidatedOutput(true, stack_configuration)
    if(!flags['stack']) return result.pushError(ErrorStrings.STACK.EMPTY)

    const stacks_dir = flags?.['stacks-dir'] || this.settings.get("stacks-dir")
    const local_stack_path = path.join(stacks_dir, flags['stack'])

    let load_path: string|undefined
    if(fs.existsSync(flags['stack'])) // check if stack is path
      load_path = path.resolve(flags['stack'])
    else if(fs.existsSync(local_stack_path)) // check if stack exists in stacks dir
      load_path = local_stack_path

    if(load_path) // attempt to load stack
      return result.absorb(
        stack_configuration.load(
          load_path,
          flags?.['config-files'] || []
        )
      )
    else // interpret input as remote image
      stack_configuration.setImage(flags['stack'])
    return result
  }

  // ===========================================================================
  // Flag Parsing Functions
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // PARSELABELFLAG parses array of strings "key=value", and returns an array
  // of objects with key and value fields. Any malformed strings are ignored
  // -- Parameters -------------------------------------------------------------
  // raw_labels: Array<string> Array of raw label data. Each entry should
  // adhere to the format "key=value"
  // -- Returns ----------------------------------------------------------------
  //  Array<object> Each object has properties "key" and "value"
  // ---------------------------------------------------------------------------
  protected parseLabelFlag(raw_labels: Array<string>, message: string="") : Dictionary
  {
    const labels:Dictionary = {}
    raw_labels.map((l:string) => {
      const split_index = l.search('=')
      if(split_index >= 1)
        labels[l.substring(0, split_index)] = l.substring(split_index + 1)
    })
    if(message) labels['message'] = message
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
  // EXTRACTVISIBLESTACKS parses flags and pulls out fill paths for any stacks
  // listed in the visible-stacks field
  // ---------------------------------------------------------------------------
  extractVisibleStacks(flags: {'visible-stacks'?: Array<string>, 'stacks-dir': string}) : Array<string>|undefined
  {
    return flags?.['visible-stacks']?.map( (stack:string) =>
      this.fullStackPath(stack, flags["stacks-dir"]) )
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
  protected extractBuildFlags(flags: Dictionary) : Array<string>
  {
    const build_flags: Array<string> = []
    const options = flags['build-mode'].split(',').map((s:string) => s.trim()) || []
    if(options.includes('reuse-image'))
      return build_flags
    if(options.includes('pull'))
      build_flags.push('pull')
    if(options.includes('no-cache'))
      build_flags.push('no-cache')
    return build_flags;
  }

  protected extractReuseImage(flags: Dictionary) : boolean
  {
    const options = flags['build-mode'].split(',').map((s:string) => s.trim()) || []
    if(options.includes('reuse-image'))
      return true
    return false
  }

  // ===========================================================================
  // Container SDK Functions
  // ===========================================================================

  initContainerSDK(verbose: boolean, quiet: boolean, explicit: boolean) : ContainerSDK
  {
    const container_drivers = {
      "runner": this.newRunDriver(explicit, quiet),
      "builder": this.newBuildDriver(explicit, quiet)
    }
    const configurations = this.newConfigurationsObject()
    const output_options = {
      "verbose": verbose,
      "quiet": quiet
    }
    const job_manager = this.newJobManager(container_drivers, configurations, output_options)

    return {
      "configurations": configurations,
      "container_drivers": container_drivers,
      "output_options": output_options,
      "job_manager": job_manager
    }
  }

  newConfigurationsObject() : Configurations
  {
    const tag:string = this.settings.get('image-tag')
    const stack = () => new DockerStackConfiguration({"tag": tag})
    const job = (stack_configuration?: StackConfiguration<any>) =>
    {
      if(stack_configuration instanceof DockerStackConfiguration)
        return new DockerJobConfiguration(stack_configuration)
      else
        return new DockerJobConfiguration(new DockerStackConfiguration())
    }
    const exec = (options?:ExecConstructorOptions) => new ExecConfiguration(options)

    return {"stack": stack, "job": job, "exec": exec}
  }

  newBuildDriver(explicit: boolean = false, silent: boolean = false) : BuildDriver
  {
    const shell = new ShellCommand(explicit, silent)
    const build_driver = this.settings.get('build-driver');
    const socket:string = this.settings.get('socket-path')
    const build_dir = path.join(this.config.dataDir, constants.subdirectories.data.build)

    switch(build_driver)
    {
        case "docker-cli":
        {
          return new DockerCliBuildDriver(shell);
        }
        case "docker-socket":
        {
          return new DockerSocketBuildDriver(shell, {
            "tmpdir": build_dir,
            "socket": socket
          });
        }
        case "podman-cli":
        {
          return new PodmanCliBuildDriver(shell);
        }
        case "podman-socket":
        {
          this.startPodmanSocketOnce(shell, socket)
          return new PodmanSocketBuildDriver(shell,  {
            "tmpdir": build_dir,
            "socket": socket
          });
        }
        default:
        {
          this.error("invalid build command")
        }
    }
  }

  newRunDriver(explicit: boolean = false, silent: boolean = false) : RunDriver
  {
    const shell = new ShellCommand(explicit, silent)
    const run_driver = this.settings.get('run-driver');
    const selinux:boolean = this.settings.get('selinux')
    const socket:string = this.settings.get('socket-path')

    switch(run_driver)
    {
        case "docker-cli":
        {
          return new DockerCliRunDriver(shell, {"selinux": selinux});
        }
        case "docker-socket":
        {
          return new DockerSocketRunDriver(shell, {"selinux": selinux, "socket": socket});
        }
        case "podman-cli":
        {
          return new PodmanCliRunDriver(shell, {"selinux": selinux});
        }
        case "podman-socket":
        {
          this.startPodmanSocketOnce(shell, socket)
          return new PodmanSocketRunDriver(shell, {
            "selinux": selinux,
            "socket": socket
          });
        }
        default:
        {
          this.error("invalid run command")
        }
    }
  }

  newJobManager(container_drivers: ContainerDrivers, configurations: Configurations, output_options: OutputOptions)
  {
    const copy_dir = path.join(this.config.dataDir, constants.subdirectories.data["job-copy"])
    return new LocalJobManager(container_drivers, configurations, output_options, { "tmpdir": copy_dir})
  }

  newRunShortcuts() : RunShortcuts
  {
    const run_shortcuts = new RunShortcuts()
    const rs_result = run_shortcuts.loadFromFile(this.settings.get('run-shortcuts-file'))
    if(!rs_result.success) printResultState(rs_result)
    return run_shortcuts
  }

  // == Podman Socket Functions ================================================
  private startPodmanSocketOnce(shell: ShellCommand, socket: string)
  {
    if(this.podman_socket_started) return
    if(!socketExists(shell, socket))
      startPodmanSocket(shell, socket)
    this.podman_socket_started = true
  }

}
