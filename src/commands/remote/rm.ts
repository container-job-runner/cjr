import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Delete extends RemoteCommand {
  static description = 'Remove a remote resource.'
  static args   = [{name: 'remote-name', required: true}]
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Delete)
    // -- validate name --------------------------------------------------------
    const name = args["remote-name"]
    const result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- delete resource ------------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource !== undefined) {
      this.removeKeyfile(resource?.key || "")
      this.resource_configuration.deleteResource(name)
      printResultState(this.resource_configuration.writeToFile())
    }
  }
}
