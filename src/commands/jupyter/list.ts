import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNametoID} from '../../lib/functions/run-functions'
import {JUPYTER_JOB_NAME} from '../../lib/constants'
import * as path from 'path'

export default class List extends StackCommand {
  static description = 'list address of running jupiter servers for stack'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(List, true)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    const image_name = runner.imageName(stack_path)
    const job_name   = JUPYTER_JOB_NAME(image_name)
    const jupiter_id = jobNametoID(runner, stack_path, job_name);

    const result = new ValidatedOutput();
    if(jupiter_id == false)
    {
      result.success = false;
      result.pushError(`Jupiter is not running.`)
    }
    else
    {
      runner.jobExec([jupiter_id], 'jupyter notebook list', {})
    }

    this.handleErrors(result.error);
  }

}
