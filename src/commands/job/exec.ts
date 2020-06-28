import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { LocalJobCommand } from '../../lib/commands/local-job-command'
import { initX11 } from '../../lib/functions/cli-functions'

export default class Exec extends LocalJobCommand {
  static description = 'Start a new job using files from a completed or currently running job.'
  static args = [{name: 'id', required: true}, {name: 'command', required: true}]
  static flags = {
    "resource": flags.string({default: 'localhost', env: 'RESOURCE'}),
    "stack": flags.string({env: 'STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "async": flags.boolean({exclusive: ['sync']}),
    "sync": flags.boolean({exclusive: ['async']}),
    "x11": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "message": flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet":flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false}),
    "build-mode":  flags.string({default: "cached", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Exec)
    // -- get job id -----------------------------------------------------------
    const parent_job_id = await this.getJobId(argv, flags)
    if(parent_job_id === false) return // exit if user selects empty id or exits interactive dialog
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- run basic exec -------------------------------------------------------
    const { job, job_data } = this.runSimpleExec(parent_job_id, flags, argv.slice(1))
    printValidatedOutput(job_data)
    printValidatedOutput(job)
  }
}
