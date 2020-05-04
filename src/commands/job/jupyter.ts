import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {} from "../../lib/functions/jupyter-functions"
import {printResultState, initX11} from '../../lib/functions/misc-functions'
import {startJupyterInJob, stopJupyter, listJupyter, getJupyterUrl, startJupyterApp} from '../../lib/functions/jupyter-functions'
import {OutputOptions, ContainerDrivers, nextAvailablePort, firstJobId} from '../../lib/functions/run-functions'
import {ValidatedOutput} from '../../lib/validated-output'

export default class Run extends StackCommand {
  static description = 'Start a jupiter server for viewing or modifying job\'s files or outputs.'
  static args = [{name: 'id', required: true}, {name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "stack": flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "port": flags.string({default: "auto"}),
    "x11": flags.boolean({default: false}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "explicit": flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"})
    }
  static strict = false;

  async run()
  {
    const {argv, args, flags} = this.parse(Run)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": (args?.['command'] === 'start'), // only require stack for start,
      "config-files": false,
      "project-root":false,
      "stacks-dir": false,
      "visible-stacks":false
    })
    const stack_path = this.fullStackPath(flags.stack || "", flags["stacks-dir"] || "")
    const parent_stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"])) // parent job be run using one of these stacks
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   false,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const drivers:ContainerDrivers = {
      builder: this.newBuildDriver(flags.explicit),
      runner:  this.newRunDriver(flags.explicit)
    }
    // -- extract full id ------------------------------------------------------
    const id_request:ValidatedOutput<string> = firstJobId(drivers.runner.jobInfo({"ids": [args.id]}))
    if(!id_request.success) return printResultState(id_request)
    const job_id = id_request.value
    // -- read settings --------------------------------------------------------
    const project_root = flags['project-root'] || "";
    const webapp_path = this.settings.get('webapp');
    if(args['command'] === 'start') // -- start jupyter ------------------------
    {
      // -- check x11 user settings ----------------------------------------------
      if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
      // -- select port ----------------------------------------------------------
      if(flags['port'] == 'auto')
        flags['port'] = `${nextAvailablePort(drivers.runner, 7019)}`

      const result = startJupyterInJob(
        drivers,
        {
          "id": job_id,
          "allowable-stack-paths": parent_stack_paths
        },
        output_options,
        {
          "stack-path": stack_path,
          "config-files": flags['config-files'],
          "project-root": project_root,
          "ports": this.parsePortFlag([flags.port]),
          "command": this.settings.get('jupyter-command'),
          "args": argv.slice(2),
          "labels": this.parseLabelFlag(flags['label']),
          "sync": false,
          "x11": flags.x11,
          "build-options": this.parseBuildModeFlag(flags["build-mode"])
        });
      printResultState(result)
    }
    if(args['command'] === 'stop') // -- stop jupyter --------------------------
    {
      const result = stopJupyter(drivers, {"job-id": job_id});
      printResultState(result)
    }
    if(args['command'] === 'list') // -- list jupyter --------------------------
    {
      const result = listJupyter(drivers, {"job-id": job_id})
      printResultState(result)
    }
    if(args['command'] === 'url' || (!flags['quiet'] && args['command'] === 'start' && !webapp_path)) // -- list jupyter url
    {
      const url_result = await getJupyterUrl(drivers, {"job-id": job_id})
      if(url_result.success) console.log(url_result.value)
      else printResultState(url_result)
    }
    if(args['command'] === 'app' || (!flags['quiet'] && args['command'] === 'start' && webapp_path)) // -- start electron app
    {
      const url_result = await getJupyterUrl(drivers, {"job-id": job_id})
      if(url_result.success) startJupyterApp(url_result.value, webapp_path || "", flags.explicit)
      else printResultState(url_result)
    }

  }

}
