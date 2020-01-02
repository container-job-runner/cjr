import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'

export default class Set extends StackCommand {
  static description = 'set parameters'
  static args = [{name: 'key'}, {name: 'value'}]
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    const key    = args['key']
    const value  = args['value']
    var result = this.settings.set(key, value)
    if(result.success) this.log(`set ${key} to ${value}`)
    this.handleErrors(result.error);
  }
}
