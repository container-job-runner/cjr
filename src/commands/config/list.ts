import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {cli_settings_yml_name} from '../../lib/constants'
import * as chalk from 'chalk'

export default class List extends StackCommand {
  static description = 'List all CLI parameters and data directories.'
  static strict = true;

  async run() {

    this.settings.load()
    console.log(chalk`\n-- {bold CLI Settings} -----------------------------\n`)
    for(var key in this.settings.settings) {
      console.log(chalk`  {italic ${key}}:\t${this.settings.settings[key]}`)
    }
    console.log(chalk`\n-- {bold CLI Data Path:} stores job information ----\n  ${this.config.dataDir}`)
    console.log(chalk`\n-- {bold CLI Config Path:} stores ${cli_settings_yml_name}.yml -----\n  ${this.config.configDir}`, '\n')

  }
}
