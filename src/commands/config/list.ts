import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {cli_settings_yml_name} from '../../lib/constants'
import * as chalk from 'chalk'

export default class List extends StackCommand {
  static description = 'List all CLI parameters and data directories.'
  static flags = {
    json: flags.boolean({default: false}),
  }
  static strict = true;


  async run() {
    const {flags} = this.parse(List)
    const raw_data = this.settings.getRawData()
    if(flags.json) // -- json output -------------------------------------------
    {
      console.log(JSON.stringify(raw_data))
    }
    else // -- standard output -------------------------------------------------
    {
      this.log(chalk`\n-- {bold CLI Settings} -----------------------------\n`)
      for(var key in raw_data) {
        console.log(chalk`   {italic ${key}}: {green ${raw_data[key]}}`)
      }
      this.log(chalk`\n-- {bold CLI Data Path:} contains temporary data ----\n\n   ${this.config.dataDir}`)
      this.log(chalk`\n-- {bold CLI Config Path:} contains settings files -----\n\n   ${this.config.configDir}`, '\n')
    }
  }
}
