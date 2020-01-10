import {flags} from '@oclif/command'
import {JobCommand} from '../lib/commands/job-command'
import {containerWorkingDir, IfBuiltAndLoaded} from '../lib/functions/run-functions'
import * as chalk from 'chalk'

export default class Run extends JobCommand {
  static description = 'Save current files as a result.'
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    containerRoot: flags.string({default: false}),
    silent: flags.boolean({default: false}) // if selected will not print out job id
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run, true)
    const builder    = this.newBuilder(flags.explicit)
    const runner     = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    var   job_id     = false

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {
        if(hostRoot)
        {
           const ced = containerWorkingDir(process.cwd(), hostRoot, containerRoot)
           if(ced) configuration.setWorkingDir(ced)
        }

        var run_flags_object = configuration.runObject();
        var job_object = {
          command: "exit",
          hostRoot: hostRoot,
          containerRoot: containerRoot,
          synchronous: false,
          removeOnExit: false // always store job after completion
        }

        const resultPaths = configuration.getResultPaths()
        if(resultPaths) job_object["resultPaths"] = resultPaths

        var result = runner.jobStart(stack_path, job_object, run_flags_object)
        if(result.success) {
          job_id = result.data
          this.job_json.write(job_id, job_object)
        }
        return result;
      })
    if(job_id !== false && !flags.silent) console.log(chalk`{italic id}: ${job_id}`)
    this.handleFinalOutput(result);

  }

}
