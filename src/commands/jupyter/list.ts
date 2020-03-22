import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNameLabeltoID} from '../../lib/functions/run-functions'
import {JUPYTER_JOB_NAME} from '../../lib/constants'

export default class List extends StackCommand {
  static description = 'List the url of any running jupiter servers for stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "stacks-dir": false})
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath((flags.stack as string), flags["stacks-dir"] || "")
    const jupyter_id = jobNameLabeltoID(runner, JUPYTER_JOB_NAME, stack_path, "running");

    if(jupyter_id === false)
    {
      printResultState(new ValidatedOutput(false).pushError(`Jupyter is not running.`))
    }
    else
    {
      runner.jobExec(jupyter_id, ['jupyter', 'notebook', 'list'], {}, "print")
    }

  }

}
