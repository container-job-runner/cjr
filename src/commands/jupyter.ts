import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {} from "../lib/functions/jupyter-functions"
import {printResultState, initX11} from '../lib/functions/misc-functions'
import {startJupyterInProject, stopJupyter, listJupyter, getJupyterUrl, startJupyterApp} from '../lib/functions/jupyter-functions'
import {ValidatedOutput} from '../lib/validated-output'

export default class Run extends StackCommand {
  static description = 'Start a jupiter server'
  static args = []
  static flags = {
    start: flags.boolean({exclusive: ['stop',  'list', 'url', 'app'], description: 'start a jupyter server.'}),
    stop:  flags.boolean({exclusive: ['start', 'list', 'url', 'app'], description: 'stop a jupyter server.'}),
    list:  flags.boolean({exclusive: ['start', 'stop', 'url', 'app'], description: 'list running jupyter server.'}),
    url:  flags.boolean({exclusive:  ['start', 'stop', 'list', 'app'], description: 'print url of running jupyter server.'}),
    app:   flags.boolean({exclusive: ['start', 'stop', 'url', 'list'], description: 'start jupyter electron app.'}),
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    x11: flags.boolean({default: false}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    explicit: flags.boolean({default: false}),
    port: flags.integer({default: 8888, exclusive: ['stop', 'list', 'app']}),
    sync: flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
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
    if(flags['x11']) initX11(this.settings.get('interactive'), flags.explicit)

    var result = new ValidatedOutput(true)
    const project_root = flags['project-root'] || "";
    const jupyter_app = this.settings.get('jupyter_app');
    if(flags.start) // -- start jupyter ----------------------------------------
    {
      result = startJupyterInProject(
        container_runtime,
        output_options,
        {
          "stack-path": stack_path,
          "config-files": flags['config-files'],
          "project-root": project_root,
          "port": flags['port'],
          "command": this.settings.get('jupyter_command'),
          "args": argv,
          "sync": flags.sync,
          "x11": flags.x11
        });
    }
    if(flags.stop) // -- stop jupyter ------------------------------------------
    {
      result = stopJupyter(container_runtime, stack_path, {"project-root": project_root});
    }
    if(flags.list) // -- list jupyter ------------------------------------------
    {
      result = listJupyter(container_runtime, stack_path, {"project-root": project_root})
    }
    if(flags.url || (flags.start && !jupyter_app)) // -- list jupyter url ---------------------------------------
    {
      result = await getJupyterUrl(container_runtime, stack_path, {"project-root": project_root})
      if(result.success) console.log(result.data)
    }
    if(flags.app || (flags.start && jupyter_app)) // -- start electron app -------------------------------------
    {
      result = await getJupyterUrl(container_runtime, stack_path, {"project-root": project_root})
      if(result.success) startJupyterApp(result.data, jupyter_app || "", flags.explicit)
    }
    printResultState(result)
  }

}
