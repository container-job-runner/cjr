import { flags } from '@oclif/command'
import { printResultState, printHorizontalTable } from '../lib/functions/misc-functions'
import { startJupyterInProject, stopJupyter, listJupyter, getJupyterUrl, startJupyterApp, JupyterJobInfo } from '../lib/functions/jupyter-functions'
import { initX11 } from '../lib/functions/cli-functions'
import chalk = require('chalk')
import { ServerCommand } from '../lib/commands/server-command'

export default class Run extends ServerCommand {
  static description = 'Start a jupiter server'
  static args = [{name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "stack": flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "x11": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "server-port": flags.string({default: "auto", description: "default port for the jupyter server"}),
    "expose": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = false;

  async run()
  {
    const {args, argv, flags} = this.parse(Run)
    this.augmentFlagsWithProjectSettings(flags, {
      "project-root":false
    })
    this.augmentFlagsWithHere(flags)

    const project_root = flags['project-root'] || "";
    const webapp_path = this.settings.get('webapp');

    if(args['command'] === 'start') // == start jupyter ========================
    {
      // -- create stack for running jupyter -----------------------------------
      this.augmentFlagsForJob(flags)
      const create_stack = this.createStack(flags)
      if(!create_stack.success) return printResultState(create_stack)
      const {stack_configuration, container_drivers, job_manager} = create_stack.value
      // -- check x11 user settings --------------------------------------------
      if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
      // -- select port --------------------------------------------------------
      const jupyter_port = this.defaultPort(container_drivers, flags["server-port"], flags["expose"])
      // -- select lab or notebook ---------------------------------------------
      const mode = (this.settings.get('jupyter-command') == "jupyter lab") ? "lab" : "notebook"
      // -- start jupyter ------------------------------------------------------
      const result = startJupyterInProject(
        job_manager,
        {
          "stack_configuration": stack_configuration,
          "args": argv.slice(1),
          "reuse-image" : this.extractReuseImage(flags),
          "mode": mode,
          "project-root": flags["project-root"],
          "port": jupyter_port,
          "x11": flags['x11']
        }
      )
      printResultState(result)
    }
    if(args['command'] === 'stop') // == stop jupyter ==========================
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const result = stopJupyter(job_manager, {"project-root": project_root});
      printResultState(result)
    }
    if(args['command'] === 'list') // == list jupyter ==========================
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const result = listJupyter(job_manager, "in-project")
      if(!result.success)
        return printResultState(result)

      const table_parameters = {
          row_headers:    ["ID", "URL", "PROJECT"],
          column_widths:  [9, 100],
          text_widths:    [7, 100],
          silent_clip:    [true, false]
      }
      const toArray = (e:JupyterJobInfo) => [e.id, chalk`{blue ${e.url}}`, chalk`{green ${e["project-root"]}}`]
      printHorizontalTable({ ...table_parameters, ...{
        title:  "",
        data:   result.value.map(toArray)
      }})
    }
    if(args['command'] === 'url' || (!flags['quiet'] && args['command'] === 'start' && !webapp_path)) // == print jupyter url
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const url_result = await getJupyterUrl(job_manager, {"project-root": project_root})
      if(url_result.success) console.log(url_result.value)
      printResultState(url_result)
    }
    if(args['command'] === 'app' || (!flags['quiet'] && args['command'] === 'start' && webapp_path)) // == start electron app
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const url_result = await getJupyterUrl(job_manager, {"project-root": project_root})
      if(url_result.success) startJupyterApp(url_result.value, webapp_path || "", flags.explicit)
      printResultState(url_result)
    }
  }

}
