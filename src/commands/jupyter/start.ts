import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNameLabeltoID, IfBuiltAndLoaded, bindHostRoot, addPorts} from '../../lib/functions/run-functions'
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

    var result = IfBuiltAndLoaded(builder, "no-rebuild", flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {

        const jupiter_id = jobNameLabeltoID(runner, JUPYTER_JOB_NAME, stack_path, "running");
        if(jupiter_id == false) // check if container is already running
        {
          bindHostRoot(configuration, containerRoot, hostRoot);
          addPorts(configuration, flags.port)
          configuration.addLabel("name", JUPYTER_JOB_NAME)

          const job_object =
          {
            command: `jupyter notebook --port=${flags.port}${(argv.length > 0) ? " " : ""}${argv.join(" ")}`,
            hostRoot: false, // send job with hostRoot false so that no copy occurs
            containerRoot: containerRoot,
            synchronous: flags.sync,
            removeOnExit: true
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
