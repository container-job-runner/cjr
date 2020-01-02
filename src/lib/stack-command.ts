// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import Command from '@oclif/command'
import {Settings} from './settings'
import {DockerBuildDriver} from './drivers/build/docker-build-driver'
import {PodmanBuildDriver} from './drivers/build/podman-build-driver'
import {BuildahBuildDriver} from './drivers/build/buildah-build-driver'
import {DockerRunDriver} from './drivers/run/docker-run-driver'
import {PodmanRunDriver} from './drivers/run/podman-run-driver'
import {ShellCMD} from './shellcmd'

export abstract class StackCommand extends Command
{
  private settings = new Settings(this.config.configDir, this.config.name)

  fullStackPath(user_path: string) // leaves existant full path intact or generates full stack path from shortcut
  {
    return (fs.existsSync(user_path)) ? user_path : path.join(this.settings.get("stacks_path"), user_path)
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
    }
  }

  handleErrors(errors: array<string>)
  {
    errors.forEach( e => this.log(`ERROR: ${e}`))
  }

}
