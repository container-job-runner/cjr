import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {matchingJobInfo} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class State extends StackCommand {
  static description = 'get the current state of a single job'
  static args = [{name: 'id', required: true}]
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({default: [""], multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parseWithLoad(State, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunner(flags.explicit)
    var stack_paths = flags['visible-stacks'].map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    const result = matchingJobInfo(runner, [args.id], stack_paths)
    if(!result.success) return printResultState(result)
    const job_info = result.data
    console.log(job_info[0].status)
  }

}
