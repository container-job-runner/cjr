import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import * as chalk from 'chalk'

export default class Set extends StackCommand {
  static description = 'Set a CLI parameter.'
  static args = [{name: 'key'}, {name: 'value'}]
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    const key    = args['key']
    const value  = args['value']
    var result = this.settings.set(key, value)
    if(result.success) this.log(chalk`{italic ${key}} -> {green ${value}}`)
    printResultState(result)
  }
}
