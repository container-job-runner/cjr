import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {matchingJobIds, promptUserForJobId} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Attach extends StackCommand {
  static description = 'Attach back to a running job.'
  static args = [{name: 'id', required: false}]
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({default: [""], multiple: true, description: "if specified only these stacks will be affected by this command"}),
    explicit: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Attach, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunner(flags.explicit)
    var stack_paths = flags['visible-stacks'].map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    var id = argv[0] || await promptUserForJobId(runner, stack_paths, "running", !this.settings.get('interactive')) || ""
    if(id === "") return // exit if user selects empty
    // match with existing container ids
    var result = matchingJobIds(runner, [id], stack_paths)
    if(result.success) runner.jobAttach(result.data[0])
    printResultState(result)
  }

}
