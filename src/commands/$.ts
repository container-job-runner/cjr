import { Start } from './job/start'
import { initX11 } from '../lib/functions/cli-functions'
import { JobCommand } from '../lib/commands/job-command'
import { printValidatedOutput } from '../lib/functions/misc-functions'

export class StartShortcut extends JobCommand {
  static description = Start.description
  static args = Start.args
  static flags = Start.flags
  static strict = Start.strict;

  async run()
  {
    const {argv, flags} = this.parse(Start)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })
    // -- run basic job --------------------------------------------------------
    const fixed_flags = {"remove-on-exit": (flags['file-access'] === "bind")}
    const { job, job_data } = this.runSimpleJobAndCopy({ ... flags, ... fixed_flags }, argv)
    printValidatedOutput(job_data)
    printValidatedOutput(job)
  }

}
