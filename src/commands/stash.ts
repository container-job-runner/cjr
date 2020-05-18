import { flags } from '@oclif/command'
import { printResultState } from '../lib/functions/misc-functions'
import { RunCommand } from '../lib/commands/newjob-command'
import { stash_label } from '../lib/constants'

export default class Stash extends RunCommand {
  static description = 'Save current project state as a result.'
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "message": flags.string({description: "optional message to describes the job"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(Stash)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    // -- run basic job --------------------------------------------------------
    const fixed_flags = {
      "x11": false,
      "build-mode": "reuse-image",
      "file-access":  "volume",
      "working-directory": process.cwd(),
      "remove-on-exit": false,
      "label": [`${stash_label}=true`]
    }
    const { job } = this.runSimpleJob({ ... flags, ... fixed_flags }, ['exit'])
    printResultState(job)
  }

}
