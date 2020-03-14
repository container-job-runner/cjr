import {flags} from '@oclif/command'
import {JUPYTER_JOB_NAME} from '../../lib/constants'
import {StackCommand} from '../../lib/commands/stack-command'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNameLabeltoID, jobStart, ContainerRuntime, OutputOptions, JobOptions, CopyOptions} from "../../lib/functions/run-functions"
import {printResultState} from '../../lib/functions/misc-functions'

export default class Start extends StackCommand {
  static description = 'Start Jupyter server for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    explicit: flags.boolean({default: false}),
    port: flags.integer({default: 8888}),
    sync: flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Start)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   false,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const runtime_options:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit),
      runner:  this.newRunner(flags.explicit)
    }
    // -- check jupyter container is already running ---------------------------
    var result: ValidatedOutput
    const jupiter_id = jobNameLabeltoID(runtime_options.runner, JUPYTER_JOB_NAME, stack_path, "running");
    if(jupiter_id !== false) {
      result = new ValidatedOutput(false, [], [`Jupiter is already running.\n   ID: ${jupiter_id}`])
    }
    else {
      // -- set job options ------------------------------------------------------
      const jupyter_command = `${this.settings.get('jupyter_command')} --port=${flags.port}${(argv.length > 0) ? " " : ""}${argv.join(" ")}`
      var job_options:JobOptions = {
        "stack-path":   stack_path,
        "config-files": flags["config-files"],
        "build-mode":   "no-rebuild",
        "command":      jupyter_command,
        "host-root":    flags["project-root"] || "",
        "cwd":          process.cwd(),
        "file-access":  "bind",
        "synchronous":  flags.sync,
        "ports":        [{hostPort: flags.port, containerPort: flags.port}],
        "labels":       [{key:"name", "value": JUPYTER_JOB_NAME}],
        "remove":       false
      }
      // -- start job and extract job id -----------------------------------------
      var result = jobStart(runtime_options, job_options, output_options)
    }
    printResultState(result)
  }

}
