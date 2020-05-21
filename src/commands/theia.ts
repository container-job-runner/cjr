import chalk = require('chalk')
import { flags } from '@oclif/command'
import { printResultState, printHorizontalTable } from '../lib/functions/misc-functions'
import { startTheiaInProject, stopTheia, getTheiaUrl, startTheiaApp, TheiaJobInfo, listTheia } from '../lib/functions/theia-functions'
import { initX11 } from '../lib/functions/cli-functions'
import { JSTools } from '../lib/js-tools'
import { ServerCommand } from '../lib/commands/server-command'

export default class Run extends ServerCommand {
  static description = 'Start a Theia IDE.'
  static args = [{name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "stack": flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "x11": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "server-port": flags.string({default: "auto", description: "default port for the theia server"}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "expose": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "explicit": flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}),
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

    const project_root = flags['project-root'] || "";
    const webapp_path = this.settings.get('webapp');

    if(args['command'] === 'start') // == start theia ==========================
    {
      // -- create stack for running theia -------------------------------------
      this.augmentFlagsForJob(flags)
      const create_stack = this.createStack(flags)
      if(!create_stack.success) return printResultState(create_stack)
      const {stack_configuration, configurations, container_drivers, job_manager, output_options} = create_stack.value
      // -- check x11 user settings --------------------------------------------
      if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
      // -- select port --------------------------------------------------------
      const theia_port = this.defaultPort(container_drivers, flags["server-port"], flags["expose"])
      // -- start theia --------------------------------------------------------
      const result = startTheiaInProject(
        job_manager,
        {
          "stack_configuration": stack_configuration,
          "args": argv.slice(1),
          "reuse-image" : this.extractReuseImage(flags),
          "project-root": flags["project-root"],
          "port": theia_port,
          "x11": flags['x11']
        }
      )
      await JSTools.sleep(5000) // wait for server to start
      printResultState(result)
    }
    if(args['command'] === 'stop') // == stop theia ============================
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const result = stopTheia(job_manager, {"project-root": project_root});
      printResultState(result)
    }
    if(args['command'] === 'url' || (!flags['quiet'] && args['command'] === 'start' && !webapp_path)) // == print theia url
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const url_result = getTheiaUrl(job_manager, {"project-root": project_root})
      if(url_result.success) console.log(url_result.value)
      printResultState(url_result)
    }
    if(args['command'] === 'list') // == list theia ==========================
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const result = listTheia(job_manager)
      if(!result.success)
        return printResultState(result)

      const table_parameters = {
          row_headers:    ["ID", "URL", "PROJECT"],
          column_widths:  [9, 100],
          text_widths:    [7, 100],
          silent_clip:    [true, false]
      }
      const toArray = (e:TheiaJobInfo) => [e.id, chalk`{blue ${e.url}}`, chalk`{green ${e["project-root"]}}`]
      printHorizontalTable({ ...table_parameters, ...{
        title:  "",
        data:   result.value.map(toArray)
      }})
    }
    if(args['command'] === 'app' || (!flags['quiet'] && args['command'] === 'start' && webapp_path)) // == start electron app
    {
      const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
      const url_result = await getTheiaUrl(job_manager, {"project-root": project_root})
      if(url_result.success) startTheiaApp(url_result.value, webapp_path || "", flags.explicit)
      printResultState(url_result)
    }
  }

}

