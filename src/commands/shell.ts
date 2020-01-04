import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {containerWorkingDir, IfBuiltAndLoaded} from '../lib/functions/run-functions'
import * as path from 'path'

export default class Shell extends StackCommand {
  static description = 'start an interactive shell for developing in stack container'
  static args = []
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    containerRoot: flags.string({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Shell, true)
    const builder  = this.newBuilder(flags.explicit)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {

        if(hostRoot)
        {
           const hostRoot_basename = path.basename(hostRoot)
           configuration.addBind(hostRoot, path.posix.join(containerRoot, hostRoot_basename))
           const ced = containerWorkingDir(process.cwd(), hostRoot, containerRoot)
           if(ced) configuration.setWorkingDir(ced)
        }

        const job_object =
        {
          command: `bash`,
          hostRoot: false, // set false so that no data copy is performed
          containerRoot: containerRoot,
          synchronous: true,
          removeOnExit: true
        }

        return runner.jobStart(stack_path, job_object, configuration.runObject())
      })
    this.handleErrors(result.error);
  }

}
