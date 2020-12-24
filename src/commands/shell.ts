import { flags } from '@oclif/command'
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { initX11 } from '../lib/functions/cli-functions'
import { ServiceCommand } from '../lib/commands/service-command'

export default class Shell extends ServiceCommand {
  static description = 'Start an interactive shell for development on localhost.'
  static args = []
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "stack": flags.string({env: 'CJR_STACK'}),
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "explicit": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'})
  }
  static strict = true;

  async run()
  {
    const {flags} = this.parse(Shell)
    this.overrideResourceFlagForDevCommand(flags)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })
    // -- run basic job --------------------------------------------------------
    const shell_flags = {
      "quiet": false,
      "file-access": "shared",
      "label": [],
      "sync": true,
      "remove-on-exit": true
    }
    const {job, job_data} = this.runSimpleJob(
      { ... flags, ... shell_flags},
      [this.settings.get("default-container-shell")]
    )
    printValidatedOutput(job_data)
    printValidatedOutput(job)
    // // -- enable autocopy for remote shell -------------------------------------
    // // Note: requires changing line 44 to:  "remove-on-exit": (job_data.value.job_manager instanceof LocalJobManager)

    // if(job.success && job_data.success && !(job_data.value.job_manager instanceof LocalJobManager))
    // {
    //     if(this.settings.get("autocopy-on-service-exit"))
    //         printValidatedOutput(
    //             job_data.value.job_manager.copy({
    //                 "ids": [job.value.id],
    //                 "mode": "update"
    //             })
    //         )
    //     if(job_data.value.job_manager.state({ids: [job.value.id]}).value?.pop() != "running")
    //         job_data.value.job_manager.container_drivers.runner.jobDelete([job.value.id])        
    // }
  }

}
