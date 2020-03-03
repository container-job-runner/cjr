import {flags} from '@oclif/command'
import {Dictionary, StackCommand} from '../lib/commands/stack-command'
import {jobStart, jobCopy, ContainerRuntime, OutputOptions, JobOptions, CopyOptions} from "../lib/functions/run-functions"
import {RunShortcuts} from "../lib/config/run-shortcuts/run-shortcuts"
import {printResultState} from '../lib/functions/misc-functions'

export default class Run extends StackCommand {
  static description = 'Run a command as a new job.'
  static args = [{name: 'command', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    async: flags.boolean({default: false}),
    verbose: flags.boolean({default: false, description: 'prints output from stack build output and id'}),
    silent: flags.boolean({default: false, description: 'no output is printed'}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    message: flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    label: flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    autocopy: flags.boolean({default: false, exclusive: ["async"], description: "automatically copy files back to the projec root on exit"}),
    "file-access": flags.string({default: "volume", options: ["volume", "bind"], description: "how files are accessed from the container. Options are: volume and bind."}),
    "build-mode":  flags.string({default: "build", options: ["no-rebuild", "build", "build-nocache"], description: "specify how to build stack. Options are: no-rebuild, build, and build-nocache."}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Run, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack, flags["stacks-dir"])
    const run_shortcut = new RunShortcuts()
    const rs_result = run_shortcut.loadFromFile(this.settings.get('run_shortcuts_file'))
    if(!rs_result.success) printResultState(rs_result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   flags.silent,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const runtime_options:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.silent)
    }
    // -- set job options ------------------------------------------------------
    var job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-mode":   flags["build-mode"],
      "command":      run_shortcut.apply(argv).join(" "),
      "host-root":    flags["project-root"] || "",
      "cwd":          process.cwd(),
      "file-access":  flags['file-access'],
      "synchronous":  !flags.async,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       this.parseLabelFlag(flags.label, flags.message || ""),
      "remove":       (flags['file-access'] === "bind") ? true : false
    }
    // -- start job and extract job id -----------------------------------------
    var result = jobStart(runtime_options, job_options, output_options)
    if(!result.success) return printResultState(result)
    const job_id = result.data
    if(job_id !== "" && (flags.async && !flags.verbose && !flags.silent)) console.log(job_id)
    // -- autocopy results -----------------------------------------------------
    if(this.autocopyJob(flags)) {
      // -- set copy options ---------------------------------------------------
      const copy_options:CopyOptions = {
        "ids": [job_id],
        "stack-path": stack_path,
        "mode": "update",
        "verbose": flags.verbose,
      }
      printResultState(jobCopy(runtime_options, copy_options))
    }
  }

  autocopyJob(flags: Dictionary)
  {
    if(flags["autocopy"]) return true
    if(!flags.async && this.settings.get('autocopy_sync_job')) return true
    return false
  }

}
