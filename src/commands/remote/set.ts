import { flags } from '@oclif/command'
import { RemoteCommand } from '../../lib/remote/commands/remote-command'
import { JSTools } from '../../lib/js-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'
import { Resource } from '../../lib/remote/config/resource-configuration'

export default class Set extends RemoteCommand {
  static description = 'Set a remote resource parameter.'
  static args   = [
    {name: 'remote-name', required: true}
  ]
  static flags  = {
    "type": flags.string({options: ['ssh']}),
    "address": flags.string(),
    "username": flags.string(),
    "option-key": flags.string({default: [], multiple: true, dependsOn: ['option-value']}),
    "option-value": flags.string({default: [], multiple: true, dependsOn: ['option-key']})
  }
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    // -- validate name --------------------------------------------------------
    const name = args['remote-name']
    const result = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- verify same number of keys and values --------------------------------
    if(flags['option-key'].length != flags['option-value'].length)
        return printValidatedOutput(
            new ValidatedOutput(false, undefined).pushError(
                'You must specify the same number of option-keys and options-values.'
            )
        )
    // -- modify resource and write file ---------------------------------------
    let resource = this.resource_configuration.getResource(name)
    if(resource !== undefined) {
      const valid_keys = ["type", "address", "username", "key"];
      resource = { ... resource, ... (JSTools.oSubset(flags, valid_keys) as Resource)}
      // -- set any options ----------------------------------------------------
      const options = resource['options']
      flags['option-key'].map( (key:string, index: number) => {
          options[key] = flags['option-value'][index]
      })
      this.resource_configuration.setResource(name, resource)
      printValidatedOutput(this.resource_configuration.writeToFile())
    }
  }
}
