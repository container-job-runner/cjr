import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Stop extends RemoteCommand {
  static description = 'Stop a running job. This command has no effect on completed jobs.'
  static args = [{name: 'id'}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}), // new remote flag
    //stack: flags.string({env: 'STACK'}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    silent: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": true})
    this.remoteCommand("jobStop", flags, args, argv)
  }

}
