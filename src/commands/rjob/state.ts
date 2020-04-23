import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'

export default class State extends RemoteCommand {
  static description = 'Get the current state of a job.'
  static args = [{name: 'id', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'})
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parse(State)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": true})
    this.remoteCommand("jobState", flags, args, argv)
  }

}
