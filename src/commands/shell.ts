import { flags } from '@oclif/command'
import { printResultState, } from '../lib/functions/misc-functions'
import { jobToImage, initX11 } from '../lib/functions/cli-functions'
import { NewJobCommand } from '../lib/commands/new-job-command'

export default class Shell extends NewJobCommand {
  static description = 'Start an interactive shell for developing in a stack container.'
  static args = []
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "explicit": flags.boolean({default: false}),
    "save": flags.string({description: "saves new image that contains modifications"}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
  }
  static strict = true;

  async run()
  {
    const {flags} = this.parse(Shell)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- run basic job --------------------------------------------------------
    const shell_flags = {
      "quiet": false,
      "file-access": "bind",
      "label": [],
      "sync": true,
      "remove-on-exit": (flags.save !== undefined) ? false : true
    }
    const {job, job_data} = await this.runSimpleJob(
      { ... flags, ... shell_flags},
      [this.settings.get("container-default-shell")]
    )
    if(!job.success) return printResultState(job)
    if(!job_data.success) return printResultState(job)
    // -- save image -----------------------------------------------------------
    const job_id = job.value.id
    if(flags.save !== undefined)
      await jobToImage(
        job_data.value.container_drivers,
        job_id,
        flags.save,
        true,
        this.settings.get('interactive')
      )
  }

}
