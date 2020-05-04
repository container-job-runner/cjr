import { flags } from '@oclif/command'
import { StackCommand } from '../../lib/commands/stack-command'
import { promptUserForJobId, firstJobId } from '../../lib/functions/run-functions'
import { printResultState } from '../../lib/functions/misc-functions'

export default class Log extends StackCommand {
  static description = 'Print console output generated by a job.'
  static args = [{name: 'id'}]
  static flags = {
    "all": flags.boolean({default: false, description: "show all output"}),
    "lines": flags.string({default: "100"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Log)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunDriver(flags.explicit)
    // get id and stack_path
    const stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    const id = argv[0] || await promptUserForJobId(runner, stack_paths, undefined, !this.settings.get('interactive')) || ""
    if(id === "") return // exit if user selects empty
    // match with existing container ids
    const job_info_request = firstJobId(runner.jobInfo({"ids": [id], "stack-paths": stack_paths}))
    if(!job_info_request.success) return printResultState(job_info_request)
    const log_request = runner.jobLog(job_info_request.value, (flags.all) ? "all" : flags.lines)
    if(!log_request.success) return printResultState(log_request)
    console.log(log_request.value)
  }

}
