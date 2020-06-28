import { flags } from '@oclif/command'
import { RemoteCommand } from '../lib/remote/commands/remote-command'
import { RunShortcuts } from "../lib/config/run-shortcuts/run-shortcuts"
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { Dictionary } from '../lib/constants'
import { OutputOptions, JobOptions, compat_parseLabelFlag, compat_parseBuildModeFlag } from '../lib/remote/compatibility'
import { initX11 } from '../lib/functions/cli-functions'

export default class Run extends RemoteCommand {
  static description = 'Start a job that runs a shell command on a remote resource.'
  static args  = []
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}), // new remote flag
    "stack": flags.string({env: 'STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "explicit": flags.boolean({default: false}),
    "async": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "message": flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "autocopy": flags.boolean({default: false, exclusive: ["async"], description: "automatically copy files back to the projec root on exit"}),
    "file-access": flags.string({default: "volume", options: ["volume", "bind"], description: "how files are accessed from the container. Options are: volume and bind."}),
    "file-upload-mode": flags.string({default: "uncached", options: ["cached", "uncached"], description:  'specifies how project-root is uploaded. "uncached" uploads to new tmp folder while "cached" syncs to a fixed location'}),
    "stack-upload-mode": flags.string({default: "uncached", options: ["cached", "uncached"], description: 'specifies how stack is uploaded. "uncached" uploads to new tmp folder while "cached" syncs to a fixed file'}),
    "build-mode":  flags.string({default: "cached", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "protocol": flags.string({exclusive: ['file-upload-mode', 'stack-upload-mode', 'build-mode', 'file-access'], char: 'p', description: 'numeric code for rapidly specifying file-upload-mode, stack-upload-mode, and build-mode'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = false;

  async run() {
    const { flags, argv } = this.parse(Run)
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": true,
      "profile": false,
      "config-files": false,
      "project-root":false,
      "stacks-dir": false,
      "remote-name": true
    })
    this.augmentFlagsWithProfile(flags)
    this.applyProtocolFlag(flags)
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    // -- initialize run shortcuts --------------------------------------------
    const run_shortcut = new RunShortcuts()
    const rs_result = run_shortcut.loadFromFile(this.settings.get('run-shortcuts-file'))
    if(!rs_result.success) printValidatedOutput(rs_result)
    // -- validate name --------------------------------------------------------
    const name = flags['remote-name'] || ""
    var result = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   flags.quiet,
      explicit: flags.explicit
    }
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    var remote_driver = this.newRemoteDriver(resource["type"], output_options, false)
    // -- create local job manager ---------------------------------------------
    const job_manager = this.newJobManager('localhost', flags.verbose, false, flags.explicit)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
    // -- set job options ------------------------------------------------------
    var job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-options":compat_parseBuildModeFlag(flags["build-mode"]),
      "command":      run_shortcut.apply(argv).join(" "),
      "host-root":    flags["project-root"] || "",
      "cwd":          flags['working-directory'],
      "file-access":  (flags['file-access'] as "bind"|"volume"),
      "synchronous":  !flags.async,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       compat_parseLabelFlag(flags.label, flags.message || ""),
      "remove":       (flags['file-access'] === "bind")
    }
    result = remote_driver.jobStart(
      resource,
      job_manager.container_drivers,
      job_manager.configurations,
      job_options,
      {
        "auto-copy":         this.shouldAutocopy(flags),
        "stack-upload-mode": (flags['stack-upload-mode'] as "cached"|"uncached"),
        "file-upload-mode":  (flags['file-upload-mode'] as "cached"|"uncached")
      }
    )
    printValidatedOutput(result)
    remote_driver.disconnect(resource)
  }

  shouldAutocopy(flags: Dictionary)
  {
    if(!flags["project-root"]) return false
    if(flags["autocopy"]) return true
    if(!flags.async && this.settings.get('autocopy-sync-job')) return true
    return false
  }

}
