import {flags} from '@oclif/command'
import {Dictionary, JobCommand} from '../lib/commands/job-command'
import {IfBuiltAndLoaded, setRelativeWorkDir, addPorts, enableX11, prependXAuth, writeJSONJobFile} from '../lib/functions/run-functions'
import {printResultState} from '../lib/functions/misc-functions'
import * as chalk from 'chalk'

export default class Run extends JobCommand {
  static description = 'Run a command as a new job.'
  static args = [{name: 'command', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    containerRoot: flags.string(),
    explicit: flags.boolean({default: false}),
    async: flags.boolean({default: false}),
    silent: flags.boolean({default: false}), // if selected will not print out job id
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Run, true)
    const builder    = this.newBuilder(flags.explicit)
    const runner     = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    const command    = argv.join(" ")
    var   job_id     = false

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {
        setRelativeWorkDir(configuration, containerRoot, hostRoot, process.cwd())
        addPorts(configuration, flags.port)
        configuration.removeFlag("userns") // currently causes permissions problems when using podman cp command.
        if(flags.x11) enableX11(configuration, flags.explicit)

        var job_object:Dictionary = {
          command: (flags.x11) ? prependXAuth(command, flags.explicit) : command,
          hostRoot: hostRoot,
          containerRoot: containerRoot,
          synchronous: !flags.async,
          removeOnExit: false // always store job after completion
        }
        const resultPaths = configuration.getResultPaths()
        if(resultPaths) job_object["resultPaths"] = resultPaths

        var result = runner.jobStart(stack_path, job_object, configuration.runObject())
        if(result.success) job_id = result.data
        writeJSONJobFile(this.job_json, result, job_object)

        return result;
      })
    if(job_id !== false && flags.async && !flags.silent) console.log(chalk`{italic id}: ${job_id}`)
    printResultState(result);

  }

}
