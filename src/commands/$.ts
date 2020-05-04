import * as chalk from 'chalk'
import { flags } from '@oclif/command'
import { StackCommand } from '../lib/commands/stack-command'
import { jobStart, jobCopy, ContainerDrivers, OutputOptions, JobOptions, CopyOptions } from "../lib/functions/run-functions"
import { RunShortcuts } from "../lib/config/run-shortcuts/run-shortcuts"
import { printResultState, initX11 } from '../lib/functions/misc-functions'
import { Dictionary } from '../lib/constants'

export default class Run extends StackCommand {
  static description = 'Start a job that runs a shell command.'
  static args = [{name: 'command', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    verbose: flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    quiet: flags.boolean({default: false, char: 'q'}),
    async: flags.boolean({exclusive: ['sync']}),
    sync: flags.boolean({exclusive: ['async']}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    message: flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    label: flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    autocopy: flags.boolean({default: false, exclusive: ["async"], description: "automatically copy files back to the projec root on exit"}),
    "file-access": flags.string({default: "volume", options: ["volume", "bind"], description: "how files are accessed from the container. Options are: volume and bind."}),
    "build-mode":  flags.string({default: "cached", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "keep-record": flags.boolean({default: false, description: "prevents container deletion after process exit"}) // only mean for remote cjr controller. Once socket is used remove this
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run)
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":false, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack || "", flags["stacks-dir"] || "")
    const run_shortcut = new RunShortcuts()
    const rs_result = run_shortcut.loadFromFile(this.settings.get('run-shortcuts-file'))
    if(!rs_result.success) printResultState(rs_result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   flags.quiet,
      explicit: flags.explicit
    }
    // -- set container runtime options ----------------------------------------
    const drivers:ContainerDrivers = {
      builder: this.newBuildDriver(flags.explicit, !flags.verbose),
      runner:  this.newRunDriver(flags.explicit, flags.quiet)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- set job options ------------------------------------------------------
    const synchronous = (flags['sync'] || (!flags['async'] && (this.settings.get('job-default-run-mode') == 'sync'))) ? true : false
    const job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-options": this.parseBuildModeFlag(flags["build-mode"]),
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
    const start_result = jobStart(drivers, job_options, output_options)
    if(!start_result.success) return printResultState(start_result)
    // -- print id -------------------------------------------------------------
    const job_id = start_result.value.id
    const print_condition = (job_id !== "") && !flags.quiet && !flags.verbose
    if(print_condition && flags.async)
      console.log(job_id)
    if(print_condition && !flags.async && this.settings.get('alway-print-job-id'))
      console.log(chalk`-- {bold Job Id }${'-'.repeat(54)}\n${job_id}`)
    // -- autocopy results -----------------------------------------------------
    if(this.shouldAutocopy(flags, drivers, job_id, stack_path)) {
      // -- set copy options ---------------------------------------------------
      const copy_options:CopyOptions = {
        "ids": [job_id],
        "stack-paths": [stack_path],
        "mode": "update",
        "verbose": flags.verbose,
      }
      printResultState(jobCopy(drivers, copy_options))
    }
  }

  shouldAutocopy(flags: Dictionary, container_runtime: ContainerDrivers, job_id: string, stack_path: string)
  {
    // -- check that job has stopped -------------------------------------------
    const result = container_runtime.runner.jobInfo({"ids": [job_id], "stack-paths": [stack_path]})
    if(!result.success) return false
    if(result.value?.[0]?.state != 'exited') return false
    // -- check flag status ----------------------------------------------------
    if(!flags["project-root"]) return false
    if(flags["file-access"] === 'bind') return false
    if(flags["autocopy"]) return true
    if(!flags.async && this.settings.get('autocopy-sync-job')) return true
    return false
  }

}
