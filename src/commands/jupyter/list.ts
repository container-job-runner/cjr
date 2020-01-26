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
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(List, true)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    const image_name = runner.imageName(stack_path)
    const jupiter_id = jobNameLabeltoID(runner, JUPYTER_JOB_NAME, stack_path, "running");

    const result = new ValidatedOutput(true);
    if(jupiter_id === false)
    {
      result.pushError(`Jupiter is not running.`)
    }
    else
    {
      runner.jobExec(jupiter_id, 'jupyter notebook list')
    }

    printResultState(result)
  }

}
