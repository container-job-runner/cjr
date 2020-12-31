import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { initX11 } from '../../../lib/functions/cli-functions'
import { ServiceCommand } from '../../../lib/commands/service-command'
import { getJupyterUrl, runJupyterOnStartCommand, startJupyterInJob } from '../../../lib/functions/jupyter-functions'
import { RemoteSshJobManager } from '../../../lib/job-managers/remote/remote-ssh-job-manager'

export default class Start extends ServiceCommand {
  static description = 'Start a Jupyter server inside a job.'
  static args = [{name: 'id', default: ""}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "stack": flags.string({env: 'CJR_STACK'}),
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
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "override-entrypoint": flags.boolean({default: false, description: 'forces container entrypoint to be sh shell. This may be useful for images that where not designed for cjr.'})
  }
  static strict = false;

  async run()
  {
    const { args, argv, flags } = this.parse(Start)

    // -- get job ids --------------------------------------------------------
    const job_id = await this.getJobId([args['id']], flags)
    if(job_id === false) return // exit if user selects empty id or exits interactive dialog
    // -- create stack for running jupyter -----------------------------------
    this.augmentFlagsForJob(flags)
    const create_stack = this.createStack(flags)
    if(!create_stack.success) return printValidatedOutput(create_stack)
    const {stack_configuration, job_manager} = create_stack.value
    // -- check x11 user settings --------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })
    // -- select port --------------------------------------------------------
    const jupyter_port = this.defaultPort(job_manager, flags["server-port"], flags["expose"])
    // -- start jupyter ------------------------------------------------------
    const result = startJupyterInJob(
      job_manager,
      {
        "stack_configuration": stack_configuration,
        "args": argv.slice(1),
        "reuse-image" : this.extractReuseImage(flags),
        "mode": (this.settings.get('jupyter-interface') == "notebook") ? "notebook" : "lab",
        "job-id": job_id,
        "port": jupyter_port,
        "x11": flags['x11'],
        "override-entrypoint": flags['override-entrypoint'],
        "access-ip": this.getAccessIp(job_manager, flags)
      }
    )
    printValidatedOutput(result)
    if(!result.success) return

    const timeout = (result.value.isnew) ? (Math.floor(parseFloat(this.settings.get('timeout-jupyter')) * 1000) || 10000) : 0
    const max_tries = (result.value.isnew) ? 5 : 1
    const url_result = await getJupyterUrl(job_manager, {"job-id": job_id}, max_tries, Math.floor(timeout / max_tries))
    if(!url_result.success)
      return printValidatedOutput(url_result)

    if( (job_manager instanceof RemoteSshJobManager) && !flags['expose'] ) 
        this.startTunnel(job_manager, {
            "remote-port": jupyter_port.hostPort, 
            "local-port": jupyter_port.hostPort, 
        })

    const onstart_cmd = this.settings.get('on-http-start');
    if(flags['quiet']) // exit silently
      return    
    else if(onstart_cmd) // open webapp
      runJupyterOnStartCommand(url_result.value, onstart_cmd, flags.explicit)
    else // only print url
      console.log(url_result.value)
  }

}
