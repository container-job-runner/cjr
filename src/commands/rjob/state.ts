import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {matchingJobInfo} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class State extends RemoteCommand {
  static description = 'get the current state of a single job'
  static args = [{name: 'id', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'})
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parseWithLoad(State, {"remote-name": true})
    this.remoteCommand("jobState", flags, args, argv)
  }

}
