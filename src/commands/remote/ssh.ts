import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {SshShellCommand} from '../../lib/remote/ssh-shell-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Ssh extends RemoteCommand {
  static description = 'ssh into a remote resource.'
  static args   = [{name: 'remote-name'}]
  static flags = {
    remoteName: flags.string({env: 'REMOTENAME'}),
    x11: flags.boolean({default: false, char: 'X'}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run() {
    const {flags, args, argv} = this.parseWithLoad(Ssh, {remoteName: true})
    const resource_config = this.readResourceConfig()
    // -- validate id ----------------------------------------------------------
    var result = this.validResourceName(args["remote-name"] || flags["remoteName"] || "", resource_config)
    if(!result.success) return printResultState(result)
    const remote_name = result.data
    // -- get resource & driver ------------------------------------------------
    const resource = resource_config[remote_name]
    const ssh_shell = new SshShellCommand(flags.explicit, false, this.config.dataDir)
    var result = ssh_shell.setResource(resource)
    if(!result.success) return printResultState(result)
    ssh_shell.exec('', {}, [], {ssh: {x11: flags.x11}})
    printResultState(result)
  }
}
