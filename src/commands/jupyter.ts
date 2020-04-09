import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {} from "../lib/functions/jupyter-functions"
import {printResultState, initX11} from '../lib/functions/misc-functions'
import {startJupyterInProject, stopJupyter, listJupyter, getJupyterUrl, startJupyterApp} from '../lib/functions/jupyter-functions'
import {OutputOptions, ContainerRuntime} from '../lib/functions/run-functions'
import {ValidatedOutput} from '../lib/validated-output'

export default class Run extends StackCommand {
  static description = 'Start a jupiter server'
  static args = [{name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    stack: flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    x11: flags.boolean({default: false}),
    port: flags.string({default: "8888"}),
    explicit: flags.boolean({default: false}),
    silent: flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = false;

  async run()
  {
    const {args, argv, flags} = this.parse(Run)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": (args?.['command'] === 'start'),
      "config-files": false,
      "project-root": false,
      "stacks-dir": false
    })
    const stack_path = this.fullStackPath(flags.stack || "", flags["stacks-dir"] || "")
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
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
      result = stopJupyter(container_runtime, stack_path, {"project-root": project_root});
    }
    if(args['command'] === 'list') // -- list jupyter --------------------------
    {
      result = listJupyter(container_runtime, stack_path, {"project-root": project_root})
    }
    if(args['command'] === 'url' || (!flags['silent'] && args['command'] === 'start' && !webapp_path)) // -- list jupyter url
    {
      const url_result = await getJupyterUrl(container_runtime, stack_path, {"project-root": project_root})
      if(url_result.success) console.log(url_result.data)
      result.absorb(url_result)
    }
    if(args['command'] === 'app' || (!flags['silent'] && args['command'] === 'start' && webapp_path)) // -- start electron app
    {
      const url_result = await getJupyterUrl(container_runtime, stack_path, {"project-root": project_root})
      if(url_result.success) startJupyterApp(url_result.data, webapp_path || "", flags.explicit)
      result.absorb(url_result)
    }
    printResultState(result)
  }

}
