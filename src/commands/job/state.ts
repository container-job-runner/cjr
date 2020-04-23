import { flags } from '@oclif/command'
import { StackCommand } from '../../lib/commands/stack-command'
import { printResultState } from '../../lib/functions/misc-functions'

export default class State extends StackCommand {
  static description = 'Get the current state of a job.'
  static args = [{name: 'id', required: true}]
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(State)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunner(flags.explicit)
    const stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    const result = runner.jobInfo({'ids': [args.id], 'stack-paths': stack_paths})
    if(!result.success) return console.log('non-existent')
    const job_info = result.data
    console.log(job_info[0].state)
  }

}

// Changes:
// 1. remove matchingJobId
// 2. set all visible-stacks parameter default to empty.
// 3. replace stack_paths with
// const stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
