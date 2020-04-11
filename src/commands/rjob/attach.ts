import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Attach extends RemoteCommand {
  static description = 'Attach to a running remote job.'
  static args = [{name: 'id', required: false}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}), // new remote flag
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parse(Attach)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": true})
    this.remoteCommand("jobAttach", flags, args, argv)
  }

}
