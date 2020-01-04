import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/stack-command'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNametoID, IfBuiltAndLoaded} from '../../lib/drivers/run/functions'
import {JUPYTER_JOB_NAME} from '../../lib/drivers/run/constants'
import * as path from 'path'

export default class Start extends StackCommand {
  static description = 'start jupiter server for stack'
  static args = []
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    containerRoot: flags.string({default: false}),
    port: flags.integer({default: 8888}),
    sync: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Start, true)
    const builder  = this.newBuilder(flags.explicit)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {

        if(hostRoot) // similar to ssh add bind
        {
           const hostRoot_basename = path.basename(hostRoot)
           configuration.addBind(hostRoot, path.posix.join(containerRoot, hostRoot_basename))
        }

        const image_name = runner.imageName(stack_path)
        const job_name   = JUPYTER_JOB_NAME(image_name)
        const jupiter_id = jobNametoID(runner, stack_path, job_name);
        if(jupiter_id == false) // check if container is already running
        {
          configuration.addPort(flags.port, flags.port)
          const job_object =
          {
            command: `jupyter notebook --port=${flags.port}${(argv.length > 0) ? " " : ""}${argv.join(" ")}`,
            hostRoot: false, // send job with hostRoot false so that no copy occurs
            containerRoot: containerRoot,
            synchronous: flags.sync,
            removeOnExit: true,
            name: job_name
          }
          return runner.jobStart(stack_path, job_object, configuration.runObject())
        }
        else
        {
          return new ValidatedOutput(false, [], [`Jupiter is already running.\n   ID: ${jupiter_id}`])
        }

      })
    this.handleErrors(result.error);
  }

}
