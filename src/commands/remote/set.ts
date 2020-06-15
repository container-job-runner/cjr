import { flags } from '@oclif/command'
import { RemoteCommand, Dictionary } from '../../lib/remote/commands/remote-command'
import { JSTools } from '../../lib/js-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'

export default class Set extends RemoteCommand {
  static description = 'Set a remote resource parameter.'
  static args   = [
    {name: 'remote-name', required: true}
  ]
  static flags  = {
    "type": flags.string(),
    "address": flags.string(),
    "username": flags.string(),
    "storage-dir": flags.string({description: 'location where job data is stored on remote host.'}),
    "enabled": flags.string()
  }
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    // -- validate name --------------------------------------------------------
    const name = args['remote-name']
    const result = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- modify resource and write file ---------------------------------------
    var resource = this.resource_configuration.getResource(name)
    if(resource !== undefined) {
      const valid_keys = ["type", "address", "username", "key", "storage-dir", "enabled"];
      (resource as Dictionary) = {... (resource as Dictionary), ...JSTools.oSubset(flags, valid_keys)}
      this.resource_configuration.setResource(name, resource)
      printValidatedOutput(this.resource_configuration.writeToFile())
    }
  }
}
