import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import * as chalk from 'chalk'

export default class Get extends StackCommand {
  static description = 'Get a CLI parameter.'
  static args = [{name: 'key'}]
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Get)
    const key    = args['key']
    const value  = this.settings.get(key)
    this.log(chalk`{italic ${key}}: ${value}`)
  }
}
