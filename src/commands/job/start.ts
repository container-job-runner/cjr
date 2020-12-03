import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { JobCommand } from '../../lib/commands/job-command'
import { initX11 } from '../../lib/functions/cli-functions'

export class Start extends JobCommand {
  static description = 'Start a job that runs a shell command.'
  static args = [{name: 'command', required: true}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "stack": flags.string({env: 'CJR_STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "here": flags.boolean({default: false, exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "async": flags.boolean({exclusive: ['sync']}),
    "sync": flags.boolean({exclusive: ['async']}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "message": flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "copy": flags.boolean({default: false, exclusive: ["async"], description: "automatically copy files back to the project root on exit"}),
    "no-copy": flags.boolean({default: false, exclusive: ["async"], description: "do not copy files back to the project root on exit"}),
    "file-access": flags.string({default: "volume", options: ["volume", "shared"], description: "how files are accessed from the container."}),
    "build-mode":  flags.string({default: "cached", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = false;

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
    const fixed_flags = {"remove-on-exit": (flags['file-access'] === "shared")}
    const { job, job_data } = this.runSimpleJobAndCopy({ ... flags, ... fixed_flags }, argv)
    printValidatedOutput(job_data)
    printValidatedOutput(job)
  }

}
