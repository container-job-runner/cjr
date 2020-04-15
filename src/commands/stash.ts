import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../lib/commands/stack-command'
import {jobStart, ContainerRuntime, OutputOptions, JobOptions} from "../lib/functions/run-functions"
import {printResultState} from '../lib/functions/misc-functions'

export default class Stash extends StackCommand {
  static description = 'Save current project state as a result.'
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    message: flags.string({description: "optional message to describes the job"}),
    explicit: flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}), // if selected will not print out job id
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Stash)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "project-root":true, "config-files": false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   flags.quiet,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const c_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit),
      runner:  this.newRunner(flags.explicit)
    }
    // -- set job options ------------------------------------------------------
    var job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-options":   {'reuse-image': true},
      "command":      "exit",
      "host-root":    flags["project-root"] || "",
      "cwd":          process.cwd(),
      "file-access":  "volume",
      "synchronous":  false,
      "labels":       [{key: "jobtype", value: "stash"}, {key: "message", value: flags.message|| ""}],
      "remove":       false
    }
    // -- start job and extract job id -----------------------------------------
    var result = jobStart(c_runtime, job_options, output_options)
    if(!result.success) return printResultState(result)
    const job_id = result.data
    if(job_id != "" && !flags.quiet && this.settings.get('alway-print-job-id'))
      console.log(job_id)
  }

}
