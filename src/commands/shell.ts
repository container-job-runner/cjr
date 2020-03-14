import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {jobStart, jobToImage, ContainerRuntime, OutputOptions, JobOptions} from "../lib/functions/run-functions"
import {printResultState} from '../lib/functions/misc-functions'

export default class Shell extends StackCommand {
  static description = 'Start an interactive shell for developing in a stack container.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    save: flags.string({description: "saves new image that contains modifications"}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Shell)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack, flags["stacks-dir"])
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
    // -- set job options ------------------------------------------------------
    var job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-mode":   "no-rebuild",
      "command":      this.settings.get("container_default_shell"),
      "host-root":    flags["project-root"] || "",
      "cwd":          flags["working-directory"],
      "file-access":  "bind",
      "synchronous":  true,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "remove":       (flags.save !== undefined) ? false : true
    }

    var result = jobStart(runtime_options, job_options, output_options)
    if(!result.success) return printResultState(result)

    if(flags.save !== undefined) await jobToImage(runtime_options.runner, result, flags.save, true, this.settings.get('interactive'))
    printResultState(result);
  }

}
