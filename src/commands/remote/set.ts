import {flags} from '@oclif/command'
import {RemoteCommand, Dictionary} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {Resource, ResourceField} from '../../lib/remote/config/resource-configuration'

export default class Set extends RemoteCommand {
  static description = 'Set a remote resource parameter.'
  static args   = [
    {name: 'remote-name', required: true},
    {name: 'prop', required: true, options: ["type", "address", "username", "key", "storage-dir", "enabled"]},
    {name: 'value', required: true}
  ]
  static flags  = {}
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    // -- validate name --------------------------------------------------------
    const name = args['remote-name']
    const result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- modify resource and write file ---------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource !== undefined) {
      (resource as Dictionary)[args.prop] = args.value
      this.resource_configuration.setResource(name, resource)
      printResultState(this.resource_configuration.writeToFile())
    }
  }
}
