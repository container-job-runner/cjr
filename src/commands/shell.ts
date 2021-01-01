import { flags } from '@oclif/command'
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { initX11 } from '../lib/functions/cli-functions'
import { ServiceCommand } from '../lib/commands/service-command'
import { CLIJobFlags } from '../lib/commands/job-command'

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

    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11({
        'interactive': this.settings.get('interactive'),
        'xquartz': this.settings.get('xquartz-autostart'),
        'explicit': flags.explicit
    })

    const shell_flags = {
      "quiet": false,
      "file-access": "shared",
      "label": [],
      "sync": true,
      "remove-on-exit": true
    }
    // -- augment flags to determine if job is local ---------------------------
    const all_flags:CLIJobFlags = { ... flags, ... shell_flags}
    this.augmentFlagsForJob(all_flags)
    this.overrideResourceFlagForService(all_flags)    
    const local_job = (flags['resource'] === undefined) || (flags['resource'] === "localhost")
    all_flags["remove-on-exit"] = local_job // keep remote jobs to enable copy

    // -- run basic job --------------------------------------------------------
    const {job, job_data} = this.runSimpleJob(
      all_flags,
      [this.settings.get("default-container-shell")]
    )
    printValidatedOutput(job_data)
    printValidatedOutput(job)
    
    // -- enable autocopy for remote shell -------------------------------------
    if( job.success && job_data.success && ( ! local_job ) && this.settings.get("autocopy-on-service-exit") )
        printValidatedOutput(
            job_data.value.job_manager.copy({
                "ids": [job.value.id],
                "mode": "update",
                "warnings" : { "no-project-root" : false }
            })
        )
    if( ! local_job )
        job_data.value.job_manager.container_drivers.runner.jobDelete([job.value.id]) // faster than job_manager.delete since this does not get job info
  }

}
