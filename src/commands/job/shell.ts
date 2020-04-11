import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {jobExec, promptUserForJobId, ContainerRuntime, JobOptions, OutputOptions} from '../../lib/functions/run-functions'
import {printResultState, initX11} from '../../lib/functions/misc-functions'

export default class Shell extends StackCommand {
  static description = 'Start an interactive shell to view the files created or modified by a job'
  static args = [{name: 'id', required: false}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    x11: flags.boolean({default: false}),
    port: flags.string({default: [], multiple: true}),
    label: flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    explicit: flags.boolean({default: false}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "visible-stacks": flags.string({default: [""], multiple: true, description: "if specified only these stacks will be affected by this command"}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Shell)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "visible-stacks":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    // -- set container runtime options ----------------------------------------
    const c_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit),
      runner:  this.newRunner(flags.explicit)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- get job id -----------------------------------------------------------
    const id_str = argv[0] || await promptUserForJobId(c_runtime.runner, flags["visible-stacks"], [], !this.settings.get('interactive')) || ""
    // -- set job options ------------------------------------------------------
    var job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-options":this.parseBuildModeFlag(flags["build-mode"]),
      "command":      this.settings.get("container-default-shell"),
      "cwd":          flags['working-directory'],
      "file-access":  "volume",
      "synchronous":  true,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       this.parseLabelFlag(flags.label),
      "remove":       true
    }
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   false,
      explicit: flags.explicit
    }
    printResultState(jobExec(c_runtime, id_str, job_options, output_options))
  }
}
