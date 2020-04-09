import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {Dictionary, StackCommand} from '../lib/commands/stack-command'
import {jobStart, jobCopy, matchingJobInfo, ContainerRuntime, OutputOptions, JobOptions, CopyOptions} from "../lib/functions/run-functions"
import {RunShortcuts} from "../lib/config/run-shortcuts/run-shortcuts"
import {printResultState, initX11} from '../lib/functions/misc-functions'

export default class Run extends StackCommand {
  static description = 'Run a command as a new job.'
  static args = [{name: 'command', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    async: flags.boolean({exclusive: ['sync']}),
    sync: flags.boolean({exclusive: ['async']}),
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
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "keep-record": flags.boolean({default: false, description: "prevents container deletion after process exit"}) // only mean for remote cjr controller. Once socket is used remove this
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack || "", flags["stacks-dir"] || "")
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
    const c_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.silent)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- set job options ------------------------------------------------------
    const synchronous = (flags['sync'] || (!flags['async'] && (this.settings.get('job_default_run_mode') == 'sync'))) ? true : false
    const job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-mode":   (flags["build-mode"] as "no-rebuild"|"build"|"build-nocache"),
      "command":      run_shortcut.apply(argv).join(" "),
      "host-root":    flags["project-root"] || "",
      "cwd":          flags['working-directory'],
      "file-access":  (flags['file-access'] as "volume"|"bind"),
      "synchronous":  synchronous,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       this.parseLabelFlag(flags.label, flags.message || ""),
      "remove":       (flags['file-access'] === "bind" && !flags["keep-record"]) ? true : false
    }
    // -- start job and extract job id -----------------------------------------
    var result = jobStart(c_runtime, job_options, output_options)
    if(!result.success) return printResultState(result)
    // -- print id -------------------------------------------------------------
    const job_id = result.data
    if(job_id !== "" && flags.async && !flags.silent)
      console.log(job_id)
    if(job_id != "" && !flags.async && !flags.verbose && this.settings.get('alway-print-job-id'))
      console.log(chalk`-- {bold Job Id }${'-'.repeat(54)}\n${job_id}`)
    // -- autocopy results -----------------------------------------------------
    if(this.shouldAutocopy(flags, c_runtime, job_id, stack_path)) {
      // -- set copy options ---------------------------------------------------
      const copy_options:CopyOptions = {
        "ids": [job_id],
        "stack-paths": [stack_path],
        "mode": "update",
        "verbose": flags.verbose,
      }
      printResultState(jobCopy(c_runtime, copy_options))
    }
  }

  shouldAutocopy(flags: Dictionary, container_runtime: ContainerRuntime, job_id: string, stack_path: string)
  {
    // -- check that job has stopped -------------------------------------------
    const result = matchingJobInfo(container_runtime.runner, [job_id], [stack_path])
    if(!result.success) return false
    if(result.data?.[0]?.status != 'exited') return false
    // -- check flag status ----------------------------------------------------
    if(!flags["project-root"]) return false
    if(flags["file-access"] === 'bind') return false
    if(flags["autocopy"]) return true
    if(!flags.async && this.settings.get('autocopy-sync-job')) return true
    return false
  }

}
