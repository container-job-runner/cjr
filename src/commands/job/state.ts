import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { printResultState } from '../../lib/functions/misc-functions'

export default class State extends BasicCommand {
  static description = 'Get the current state of a job.'
  static args = [{name: 'id', required: true}]
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const { argv, flags } = this.parse(State)
    this.augmentFlagsWithProjectSettings(flags, {
      "visible-stacks":false,
      "stacks-dir": false
    })

    const { job_manager } = this.initContainerSDK(false, false, flags['explicit'])
    const states = job_manager.state({
      "ids": argv,
      "stack-paths": this.extractVisibleStacks(flags)
    })

    if(!states.success)
      return printResultState(states)
    if(states.value.length == 0)
      console.log('non-existent')
    else
      console.log(states.value.pop())
  }

}
