import { ResourceCommand } from '../../lib/commands/resource-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'

export default class Delete extends ResourceCommand {
  static description = 'Remove a remote resource.'
  static args   = [{name: 'resource', required: true}]
  static strict = true;

  async run() {
    const { args } = this.parse(Delete)
    // -- validate name --------------------------------------------------------
    const name = args["resource"]
    const result = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- delete resource ------------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource !== undefined) {
      this.removeKeyfile(resource?.key || "")
      this.resource_configuration.deleteResource(name)
      printValidatedOutput(this.resource_configuration.writeToFile())
    }
  }
}
