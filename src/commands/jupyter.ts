import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {printResultState, initX11} from '../lib/functions/misc-functions'
import {startJupyterInProject, stopJupyter, listJupyter, getJupyterUrl, startJupyterApp} from '../lib/functions/jupyter-functions'
import {OutputOptions, ContainerRuntime, nextAvailablePort} from '../lib/functions/run-functions'
import {ValidatedOutput} from '../lib/validated-output'

export default class Run extends StackCommand {
  static description = 'Start a jupiter server'
  static args = [{name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    stack: flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    x11: flags.boolean({default: false}),
    port: flags.string({default: "auto"}),
    verbose: flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    explicit: flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'})
  }
  static strict = false;

  async run()
  {
    const {args, argv, flags} = this.parse(Run)
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": (args?.['command'] === 'start'),
      "config-files": false,
      "project-root": false,
      "stacks-dir": false
    })
    const stack_path = this.fullStackPath(flags.stack || "", flags["stacks-dir"] || "")
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   false,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const container_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit),
      runner:  this.newRunner(flags.explicit)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
        // -- select port ----------------------------------------------------------
    if(flags['port'] == 'auto')
      flags['port'] = `${nextAvailablePort(container_runtime.runner, 7013)}`

    var result = new ValidatedOutput(true)
    const project_root = flags['project-root'] || "";
    const webapp_path = this.settings.get('webapp');
    if(args['command'] === 'start') // -- start jupyter ------------------------
    {
      result = startJupyterInProject(
        container_runtime,
        output_options,
        {
          "stack-path": stack_path,
          "build-options":this.parseBuildModeFlag(flags["build-mode"]),
          "config-files": flags['config-files'],
          "project-root": project_root,
          "ports": this.parsePortFlag([flags.port]),
          "command": this.settings.get('jupyter-command'),
          "args": argv.slice(1),
          "labels": [],
          "sync": false,
          "x11": flags.x11
        });
    }
    if(args['command'] === 'stop') // -- stop jupyter --------------------------
    {
      result = stopJupyter(container_runtime, {"project-root": project_root});
    }
    if(args['command'] === 'list') // -- list jupyter --------------------------
    {
      result = listJupyter(container_runtime, {"project-root": project_root})
    }
    if(args['command'] === 'url' || (!flags['quiet'] && args['command'] === 'start' && !webapp_path)) // -- list jupyter url
    {
      const url_result = await getJupyterUrl(container_runtime, {"project-root": project_root})
      if(url_result.success) console.log(url_result.data)
      result.absorb(url_result)
    }
    if(args['command'] === 'app' || (!flags['quiet'] && args['command'] === 'start' && webapp_path)) // -- start electron app
    {
      const url_result = await getJupyterUrl(container_runtime, {"project-root": project_root})
      if(url_result.success) startJupyterApp(url_result.data, webapp_path || "", flags.explicit)
      result.absorb(url_result)
    }
    printResultState(result)
  }

}
