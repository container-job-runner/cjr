import { flags } from '@oclif/command'
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { NewJobCommand } from '../lib/commands/new-job-command'
import { initX11 } from '../lib/functions/cli-functions'

export default class Run extends NewJobCommand {
  static description = 'Start a job that runs a shell command.'
  static args = [{name: 'command', required: true}]
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
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
    "autocopy": flags.boolean({default: false, exclusive: ["async"], description: "automatically copy files back to the projec root on exit"}),
    "file-access": flags.string({default: "volume", options: ["volume", "bind"], description: "how files are accessed from the container. Options are: volume and bind."}),
    "build-mode":  flags.string({default: "cached", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- run basic job --------------------------------------------------------
    const fixed_flags = {"remove-on-exit": (flags['file-access'] === "bind")}
    const { job, job_data } = this.runSimpleJobAndCopy({ ... flags, ... fixed_flags }, argv)
    printValidatedOutput(job_data)
    printValidatedOutput(job)
  }

}
