import { flags } from '@oclif/command'
import { RemoteCommand, Dictionary } from '../../lib/remote/commands/remote-command'
import { JSTools } from '../../lib/js-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'

export default class Set extends RemoteCommand {
  static description = 'Set a remote resource parameter.'
  static args   = [
    {name: 'remote-name', required: true}
  ]
  static flags  = {
    "type": flags.string(),
    "address": flags.string(),
    "username": flags.string(),
    "option-key": flags.string({default: [], multiple: true, dependsOn: ['option-value']}),
    "option-value": flags.string({default: [], multiple: true, dependsOn: ['option-key']}),
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
      const valid_keys = ["type", "address", "username", "key", "storage-dir", "enabled"];
      (resource as Dictionary) = {... (resource as Dictionary), ...JSTools.oSubset(flags, valid_keys)}
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
