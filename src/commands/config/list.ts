import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {cli_settings_yml_name} from '../../lib/constants'
import * as chalk from 'chalk'

export default class List extends StackCommand {
  static description = 'List all CLI parameters and data directories.'
  static strict = true;

  async run() {
    this.log(chalk`\n-- {bold CLI Settings} -----------------------------\n`)
    const raw_data = this.settings.getRawData()
    for(var key in raw_data) {
      console.log(chalk`  {italic ${key}}:\t${raw_data[key]}`)
    }
    this.log(chalk`\n-- {bold CLI Data Path:} stores temporary job data ----\n  ${this.config.dataDir}`)
    this.log(chalk`\n-- {bold CLI Config Path:} stores ${cli_settings_yml_name}.yml -----\n  ${this.config.configDir}`, '\n')

  }
}
