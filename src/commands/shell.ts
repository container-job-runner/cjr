import { flags } from '@oclif/command'
import { StackCommand } from '../lib/commands/stack-command'
import { jobStart, jobToImage, ContainerRuntime, OutputOptions, JobOptions } from "../lib/functions/run-functions"
import { printResultState, initX11 } from '../lib/functions/misc-functions'
import { ValidatedOutput } from '../lib/validated-output'

export default class Shell extends StackCommand {
  static description = 'Start an interactive shell for developing in a stack container.'
  static args = []
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "explicit": flags.boolean({default: false}),
    "save": flags.string({description: "saves new image that contains modifications"}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Shell)
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   false,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const c_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit),
      runner:  this.newRunner(flags.explicit)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- set job options ------------------------------------------------------
    var job_options:JobOptions = {
      "stack-path":    stack_path,
      "config-files":  flags["config-files"],
      "build-options": this.parseBuildModeFlag(flags["build-mode"]),
      "command":       this.settings.get("container-default-shell"),
      "host-root":     flags["project-root"] || "",
      "cwd":           flags["working-directory"],
      "file-access":   "bind",
      "synchronous":   true,
      "x11":           flags.x11,
      "ports":         this.parsePortFlag(flags.port),
      "remove":        (flags.save !== undefined) ? false : true
    }

    const start_result = jobStart(c_runtime, job_options, output_options)
    if(!start_result.success) return printResultState(start_result)

    if(flags.save !== undefined) await jobToImage(
      c_runtime.runner,
      new ValidatedOutput(start_result.success, start_result.data.id), // wrap id into ValidatedOutput<string>
      flags.save,
      true,
      this.settings.get('interactive')
    )
    printResultState(start_result);
  }

}
