import path = require('path')
import constants = require('../../lib/constants')
import { flags } from '@oclif/command'
import { ResourceCommand } from '../../lib/commands/resource-command'
import { SshShellCommand } from '../../lib/ssh-shell-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'

export default class Ssh extends ResourceCommand {
  static description = 'ssh into a remote resource.'
  static args   = [{name: 'resource'}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "x11": flags.boolean({default: false, char: 'X'}),
    "debug": flags.boolean({default: false})
  }
  static strict = false;

  async run() {
    const { flags, args } = this.parse(Ssh)
    this.augmentFlagsWithProjectSettings(flags, {"resource": false})
    // -- validate id ----------------------------------------------------------
    const name = args["resource"] || flags["resource"] || ""
    var result:ValidatedOutput<any> = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const ssh_shell = new SshShellCommand(flags.debug, false, path.join(this.config.dataDir, constants.subdirectories.data["ssh-sockets"]))
    ssh_shell.setResource(resource)
    ssh_shell.exec('', {}, [], {ssh: {x11: flags.x11}})
    printValidatedOutput(result)
  }
}
