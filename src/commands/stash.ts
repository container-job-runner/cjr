import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../lib/commands/stack-command'
import {IfBuiltAndLoaded, setRelativeWorkDir, addPorts, addJobInfoLabel} from '../lib/functions/run-functions'
import {printResultState} from '../lib/functions/misc-functions'

export default class Run extends StackCommand {
  static description = 'Save current project state as a result.'
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    containerRoot: flags.string(),
    message: flags.string({description: "optional message to describes the job"}),
    explicit: flags.boolean({default: false}),
    silent: flags.boolean({default: false}) // if selected will not print out job id
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Run, true)
    const builder    = this.newBuilder(flags.explicit)
    const runner     = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    var   job_id     = false

    var result = IfBuiltAndLoaded(builder, "no-rebuild", flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {

        configuration.removeFlag("userns") // currently causes permissions problems when using podman cp command.
        configuration.addLabel("jobtype", "stash")
        if(flags.message) configuration.addLabel("message", flags.message)
        var job_object:Dictionary = {
          command: "exit",
          hostRoot: hostRoot,
          containerRoot: containerRoot,
          synchronous: false,
          removeOnExit: false // always store job after completion
        }
        const resultPaths = configuration.getResultPaths()
        if(resultPaths) job_object["resultPaths"] = resultPaths
        addJobInfoLabel(configuration, job_object)

        var result = runner.jobStart(stack_path, job_object, configuration.runObject())
        if(result.success) job_id = result.data
        return result;
      })
    if(job_id !== false && !flags.silent) console.log(job_id)
    printResultState(result);

  }

}
