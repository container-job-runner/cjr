import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { initX11 } from '../../lib/functions/cli-functions'
import { ServerCommand } from '../../lib/commands/server-command'
import { startTheiaInProject, getTheiaUrl, runTheiaOnStartCommand } from '../../lib/functions/theia-functions'
import { JSTools } from '../../lib/js-tools'

export default class Start extends ServerCommand {
  static description = 'Start a Theia server.'
  static args = [ { name: "project-root" } ]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "stack": flags.string({env: 'STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
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
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "override-entrypoint": flags.boolean({default: false, description: 'forces container entrypoint to be sh shell. This may be useful for images that where not designed for cjr.'})
  }
  static strict = true;

  async run()
  {
    const { args, flags } = this.parse(Start)
    this.augmentFlagsForJob(flags)
    this.augmentFlagsWithProjectRootArg(args, flags)

    // -- create stack for running theia -------------------------------------
    const create_stack = this.createStack(flags)
    if(!create_stack.success)
      return printValidatedOutput(create_stack)
    const {stack_configuration, job_manager } = create_stack.value
    // -- check x11 user settings --------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })
    // -- select port --------------------------------------------------------
    const theia_port = this.defaultPort(job_manager.container_drivers, flags["server-port"], flags["expose"])
    // -- start theia --------------------------------------------------------
    const result = startTheiaInProject(
        job_manager,
        {
            "stack_configuration": stack_configuration,
            "reuse-image" : this.extractReuseImage(flags),
            "project-root": flags["project-root"],
            "port": theia_port,
            "x11": flags['x11'],
            "override-entrypoint": flags['override-entrypoint'],
            "access-ip": this.getAccessIp(job_manager)
        }
    )
    printValidatedOutput(result)
    if(!result.success) return 
    
    if(result.value.isnew) { // wait for new server to start
        const timeout = Math.floor(parseFloat(this.settings.get('timeout-theia')) * 1000) || 10000
        await JSTools.sleep(timeout) 
    }

    const url_result = getTheiaUrl(job_manager, {"project-root": flags["project-root"]})
    if(!url_result.success)
      return printValidatedOutput(url_result)

    const onstart_cmd = this.settings.get('on-server-start');
    if(flags['quiet']) // exit silently
        return
    else if(onstart_cmd) // open webapp
        runTheiaOnStartCommand(url_result.value, onstart_cmd, flags.explicit)  
    else // print server url
        console.log(url_result.value)

  }

}
