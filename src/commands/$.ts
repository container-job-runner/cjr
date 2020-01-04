import {flags} from '@oclif/command'
import {JobCommand} from '../lib/job-command'
import {containerWorkingDir, IfBuiltAndLoaded} from '../lib/drivers/run/functions'

export default class Run extends JobCommand {
  static description = 'run a shell command as a new job'
  static args = [{name: 'command', required: true}]
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    containerRoot: flags.string({default: false}),
    async: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run, true)
    const builder  = this.newBuilder(flags.explicit)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    const command    = argv.join(" ");

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {
        if(hostRoot)
        {
           const ced = containerWorkingDir(process.cwd(), hostRoot, containerRoot)
           if(ced) configuration.setWorkingDir(ced)
        }

        var run_flags_object = configuration.runObject();
        var job_object = {
          command: command,
          hostRoot: hostRoot,
          containerRoot: containerRoot,
          synchronous: !flags.async,
          removeOnExit: false // always store job after completion
        }

        const resultPaths = configuration.getResultPaths()
        if(resultPaths) job_object["resultPaths"] = resultPaths

        var result = runner.jobStart(stack_path, job_object, run_flags_object)
        if(result.success) this.job_json.write(result.data, job_object)
        return result;
      })
    this.handleErrors(result.error);

  }

}
