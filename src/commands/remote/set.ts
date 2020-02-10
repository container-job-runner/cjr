import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Set extends RemoteCommand {
  static description = 'Set a remote resource parameter.'
  static args   = [{name: 'remote-name', required: true}, {name: 'prop', required: true}, {name: 'value', required: true}]
  static flags  = {}
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    const resource_config = this.readResourceConfig()
    // -- validate id ----------------------------------------------------------
    var result = this.validResourceName(args['remote-name'], resource_config)
    if(!result.success) return printResultState(result)
    // -- modify resource and write file ---------------------------------------
    const remote_name = result.data
    const resource = resource_config[remote_name]
    resource[args.prop] = args.value
    printResultState(this.writeResourceConfig(resource_config))
  }
}
