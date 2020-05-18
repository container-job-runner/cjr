import { flags } from '@oclif/command'
import { RemoteCommand } from '../../lib/remote/commands/remote-command'
import { SshShellCommand } from '../../lib/remote/ssh-shell-command'
import { printResultState } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'

export default class Ssh extends RemoteCommand {
  static description = 'ssh into a remote resource.'
  static args   = [{name: 'remote-name'}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    "x11": flags.boolean({default: false, char: 'X'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run() {
    const {flags, args, argv} = this.parse(Ssh)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": false})
    // -- validate id ----------------------------------------------------------
    const name = args["remote-name"] || flags["remote-name"] || ""
    var result:ValidatedOutput<any> = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const ssh_shell = new SshShellCommand(flags.explicit, false, this.config.dataDir)
    result = ssh_shell.setResource(resource)
    if(!result.success) return printResultState(result)
    ssh_shell.exec('', {}, [], {ssh: {x11: flags.x11}})
    printResultState(result)
  }
}
