import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {JobCommand} from '../lib/commands/job-command'
import {IfBuiltAndLoaded, setRelativeWorkDir, addPorts, writeJSONJobFile} from '../lib/functions/run-functions'
import {printResultState} from '../lib/functions/misc-functions'

export default class Run extends JobCommand {
  static description = 'Save current project state as a result.'
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

        var job_object = {
          command: "exit",
          hostRoot: hostRoot,
          containerRoot: containerRoot,
          synchronous: false,
          removeOnExit: false // always store job after completion
        }
        const resultPaths = configuration.getResultPaths()
        if(resultPaths) job_object["resultPaths"] = resultPaths

        var result = runner.jobStart(stack_path, job_object, configuration.runObject())
        if(result.success) job_id = result.data
        writeJSONJobFile(this.job_json, result, job_object)

        return result;
      })
    if(job_id !== false && !flags.silent) console.log(chalk`{italic id}: ${job_id}`)
    printResultState(result);

  }

}
