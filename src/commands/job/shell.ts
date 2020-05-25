import { flags} from '@oclif/command'
import { printResultState } from '../../lib/functions/misc-functions'
import { NewJobCommand } from '../../lib/commands/new-job-command'
import { initX11 } from '../../lib/functions/cli-functions'

export default class Shell extends NewJobCommand {
  static description = 'Start an interactive shell to view or modify a job\'s files or outputs.'
  static args = [{name: 'id', required: false}]
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "x11": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
  }
  static strict = true;

  async run()
  {
    const { argv, flags } = this.parse(Shell)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- get job id -----------------------------------------------------------
    const parent_id = await this.getJobId(argv, flags)
    if(parent_id === false) return // exit if user selects empty id or exits interactive dialog
    // -- run basic exec -------------------------------------------------------
    const { job, job_data } = this.runSimpleExec(
      parent_id,
      { ...flags, ... {quiet: false}},
      this.settings.get("container-default-shell")
    )
    printResultState(job_data)
    printResultState(job)
  }

}
