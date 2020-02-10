import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Delete extends RemoteCommand {
  static description = 'Remove a remote resource.'
  static args   = [{name: 'remote-name', required: true}]
  static flags  = {}
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Delete)
    const resource_config = this.readResourceConfig()
    // -- validate name ----------------------------------------------------------
    var result = this.validResourceName(args["remote-name"], resource_config)
    if(!result.success) return printResultState(result)
    // -- delete resource ------------------------------------------------------
    const name = result.data
    this.removeKeyfile(resource_config[name]?.key || "")
    delete resource_config[name]
    printResultState(this.writeResourceConfig(resource_config))
  }
}
