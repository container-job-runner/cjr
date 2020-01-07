import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {cli_settings_yml_name} from '../../lib/constants'

export default class List extends StackCommand {
  static description = 'List all CLI parameters and data directories.'
  static strict = true;

  async run() {

    this.settings.load()
    console.log("\n-- CLI Settings -----------------------------")
    for(var key in this.settings.settings) {
      console.log(`  ${key}:\t${this.settings.settings[key]}`)
    }
    console.log(`\n-- CLI Data Path: stores job information ----\n  ${this.config.dataDir}`)
    console.log(`\n-- CLI Config Path: stores ${cli_settings_yml_name}.yml -----\n  ${this.config.configDir}`, '\n')

  }
}
