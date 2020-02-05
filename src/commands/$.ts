import {flags} from '@oclif/command'
import {Dictionary, StackCommand} from '../lib/commands/stack-command'
import {bashEscapeArgs, IfBuiltAndLoaded, setRelativeWorkDir, addPorts, enableX11, prependXAuth, addJobInfoLabel} from '../lib/functions/run-functions'
import {printResultState} from '../lib/functions/misc-functions'
import {JSTools} from '../lib/js-tools'
import * as chalk from 'chalk'

export default class Run extends StackCommand {
  static description = 'Run a command as a new job.'
  static args = [{name: 'command', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    containerRoot: flags.string(),
    explicit: flags.boolean({default: false}),
    async: flags.boolean({default: false}),
    verbose: flags.boolean({default: false, description: 'prints output from stack build output and id'}), // if selected will not print out job id
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    message: flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    autocopy: flags.boolean({default: false, exclusive: ["async", "autocopy-all"], description: "automatically copy files back to hostRoot on exit"}),
    "autocopy-all": flags.boolean({default: false, exclusive: ["async", "autocopy"], description: "automatically copy all files results back to hostRoot on exit"}),
    "skip-rebuild": flags.boolean({default: false, description: "does not rebuild stack before running job"}),
    "build-nocache": flags.boolean({default: false, exclusive: ["no-rebuild"], description: "rebuilds stack with no-cache flag active"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Run, true)
    const builder    = this.newBuilder(flags.explicit, !flags.verbose)
    const runner     = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    const command    = bashEscapeArgs(argv).join(" ")
    const build_mode = this.buildMode(flags)
    var   job_id     = ""

    this.printBuildHeader(flags.verbose)
    var result = IfBuiltAndLoaded(builder, build_mode, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {
        setRelativeWorkDir(configuration, containerRoot, hostRoot, process.cwd())
        addPorts(configuration, flags.port)
        if(flags.x11) enableX11(configuration, flags.explicit)
        if(flags.message) configuration.addLabel("message", flags.message)
        configuration.removeFlag("userns") // currently causes permissions problems when using podman cp command.

        var job_object:Dictionary = {
          command: (flags.x11) ? prependXAuth(command, flags.explicit) : command,
          hostRoot: hostRoot,
          containerRoot: containerRoot,
          synchronous: !flags.async,
          removeOnExit: false // always store job after completion
        }
        const resultPaths = configuration.getResultPaths()
        if(resultPaths) job_object["resultPaths"] = resultPaths
        // label job with important information
        addJobInfoLabel(configuration, job_object)

        this.printJobHeader(flags.verbose)
        var result = runner.jobStart(stack_path, job_object, configuration.runObject())
        if(result.success) job_id = result.data
        // -- copy results if autocopy flags are active ------------------------
        if(result.success && (flags.autocopy || flags["autocopy-all"]))
          result = runner.jobCopy(job_id, job_object, flags["autocopy-all"])

        return result;
      })
    this.printIDHeader(flags.verbose)
    if(job_id !== "" && (flags.async || flags.verbose)) console.log(job_id)
    printResultState(result);

  }

  buildMode(flags: Dictionary)
  {
    if(flags["skip-rebuild"]) return "skip-rebuild"
    if(flags["build-nocache"]) return 'build-nocache'
    return "build"
  }

  printBuildHeader(verbose: boolean) {if(verbose) console.log(chalk`-- {bold Build Output} ${'-'.repeat(48)}`); }
  printJobHeader(verbose: boolean) {if(verbose) console.log(chalk`-- {bold Job Output} ${'-'.repeat(50)}`); }
  printIDHeader(verbose: boolean) {if(verbose) console.log(chalk`-- {bold Job ID} ${'-'.repeat(54)}`); }

}
