import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {jobExec, promptUserForJobId, ContainerRuntime, JobOptions, OutputOptions} from '../../lib/functions/run-functions'
import {RunShortcuts} from "../../lib/config/run-shortcuts/run-shortcuts"
import {printResultState, initX11} from '../../lib/functions/misc-functions'

export default class Shell extends StackCommand {
  static description = 'Start an interactive shell to view the files created or modified by a job'
  static args = [{name: 'id', required: true}, {name: 'command', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    async: flags.boolean({exclusive: ['sync']}),
    sync: flags.boolean({exclusive: ['async']}),
    x11: flags.boolean({default: false}),
    port: flags.string({default: [], multiple: true}),
    label: flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    message: flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    verbose: flags.boolean({default: false, description: 'prints output from stack build output and id'}),
    silent: flags.boolean({default: false, description: 'no output is printed'}),
    explicit: flags.boolean({default: false}),
    "build-mode":  flags.string({default: "build", options: ["no-rebuild", "build", "build-nocache"], description: "specify how to build stack. Options are: no-rebuild, build, and build-nocache."}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = false;

  async run()
  {
    const {args, argv, flags} = this.parse(Shell)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false})
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    const run_shortcut = new RunShortcuts()
    // -- set container runtime options ----------------------------------------
    const c_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.verbose)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- get job id -----------------------------------------------------------
    const id_str = argv[0]
    const command = run_shortcut.apply(argv.splice(1)).join(" ")
    // -- set job options ------------------------------------------------------
    const synchronous = (flags['sync'] || (!flags['async'] && (this.settings.get('job_default_run_mode') == 'sync'))) ? true : false
    var job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-mode":   (flags["build-mode"] as "no-rebuild"|"build"|"build-nocache"),
      "command":      command,
      "cwd":          flags["working-directory"],
      "file-access":  "volume",
      "synchronous":  synchronous,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       this.parseLabelFlag(flags.label, flags.message || ""),
      "remove":       true
    }
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   false,
      explicit: flags.explicit
    }
    const result = jobExec(c_runtime, id_str, job_options, output_options)
    if(!result.success) printResultState(result)
    // -- print id -------------------------------------------------------------
    const job_id = result.data
    if(job_id !== "" && flags.async && !flags.silent)
      console.log(job_id)
    if(job_id != "" && !flags.async && !flags.verbose && this.settings.get('alway-print-job-id'))
      console.log(chalk`-- {bold Job Id }${'-'.repeat(54)}\n${job_id}`)

  }
}
