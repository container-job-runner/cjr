import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNameLabeltoID} from '../../lib/functions/run-functions'
import {JUPYTER_JOB_NAME} from '../../lib/constants'

export default class Stop extends StackCommand {
  static description = 'Stop the Jupyter server for stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {stack:true})
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack as string)
    const image_name = runner.imageName(stack_path)
    const jupiter_id = jobNameLabeltoID(runner, JUPYTER_JOB_NAME, stack_path, "running");

    if(jupiter_id === false)
    {
      printResultState(new ValidatedOutput(false).pushError(`Jupiter is not running.`))
    }
    else
    {
      runner.jobStop([jupiter_id])
    }
  }

}
