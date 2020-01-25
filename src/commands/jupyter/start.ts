import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNametoID, resultNametoID, IfBuiltAndLoaded, bindHostRoot, addPorts} from '../../lib/functions/run-functions'
import {JUPYTER_JOB_NAME} from '../../lib/constants'

export default class Start extends StackCommand {
  static description = 'Start Jupyter server for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    containerRoot: flags.string(),
    explicit: flags.boolean({default: false}),
    port: flags.integer({default: [8888], multiple: true}),
    sync: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Start, true)
    const builder  = this.newBuilder(flags.explicit)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    // get name of jupyter job - not this could be done with a label
    const image_name = runner.imageName(stack_path)
    const job_name   = JUPYTER_JOB_NAME(image_name)

    // remove any results (stopped containers) with jupyter name.
    const jupiter_stopped_id = resultNametoID(runner, stack_path, job_name)
    if(jupiter_stopped_id != false) runner.resultDelete([jupiter_stopped_id])

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {

        const jupiter_id = jobNametoID(runner, stack_path, job_name);
        if(jupiter_id == false) // check if container is already running
        {
          bindHostRoot(configuration, containerRoot, hostRoot);
          addPorts(configuration, flags.port)

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
    printResultState(result)
  }

}
