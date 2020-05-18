import { flags } from '@oclif/command'
import { RemoteCommand } from '../../lib/remote/commands/remote-command'

import { RunShortcuts } from "../../lib/config/run-shortcuts/run-shortcuts"
import { printResultState } from '../../lib/functions/misc-functions'
import { compat_parseLabelFlag, compat_parseBuildModeFlag, OutputOptions, JobOptions } from '../../lib/remote/compatibility'
import { ContainerDrivers } from '../../lib/job-managers/job-manager'

export default class Exec extends RemoteCommand {
  static description = 'Start a new remote job using files from a completd or currently running remote job'
  static args = [{name: 'id', required: true}, {name: 'command', required: true}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    "stack": flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "async": flags.boolean({exclusive: ['sync']}),
    "sync": flags.boolean({exclusive: ['async']}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "message": flags.string({description: "use this flag to tag a job with a user-supplied message"}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "stack-upload-mode": flags.string({default: "uncached", options: ["cached", "uncached"], description: 'specifies how stack is uploaded. "uncached" uploads to new tmp folder while "cached" syncs to a fixed file'}),
    "build-mode":  flags.string({default: "cached", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "protocol": flags.string({exclusive: ['stack-upload-mode', 'build-mode', 'file-access'], char: 'p', description: 'numeric code for rapidly specifying stack-upload-mode, and build-mode'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet":flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parse(Exec)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": true,
      "project-root": false,
      "config-files": false,
      "remote-name": true
    })
    this.applyProtocolFlag(flags)
    const stack_path = this.fullStackPath((flags.stack as string), flags["stacks-dir"] || "")
    // -- initialize run shortcuts ---------------------------------------------
    const run_shortcut = new RunShortcuts()
    const rs_result = run_shortcut.loadFromFile(this.settings.get('run-shortcuts-file'))
    if(!rs_result.success) printResultState(rs_result)
    // -- validate name --------------------------------------------------------
    const name = (flags['remote-name'] as string)
    var result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   flags.quiet,
      explicit: flags.explicit
    }
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const driver = this.newRemoteDriver(resource["type"], output_options, false)
    // -- get job id  ----------------------------------------------------------
    const id = args.id || await driver.promptUserForJobId(resource, this.settings.get('interactive')) || ""
    // -- set container runtime options ----------------------------------------
    const drivers:ContainerDrivers = {
      builder: this.newBuildDriver(flags.explicit, !flags.verbose),
      runner:  this.newRunDriver(flags.explicit, flags.verbose)
    }
    // -- set job options ------------------------------------------------------
    const synchronous = (flags['sync'] || (!flags['async'] && (this.settings.get('job-default-run-mode') == 'sync'))) ? true : false
    const command = run_shortcut.apply(argv.splice(1)).join(" ")
    const job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-options":compat_parseBuildModeFlag(flags["build-mode"]),
      "command":      command,
      "cwd":          flags["working-directory"],
      "file-access":  "volume",
      "synchronous":  synchronous,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       compat_parseLabelFlag(flags.label, flags.message || ""),
      "remove":       false
    }
    result = driver.jobExec(
      resource,
      drivers,
      this.newConfigurationsObject(),
      job_options,
      {
        id: id,
        mode: 'job:exec',
        "host-project-root": flags["project-root"] || "",
        "stack-upload-mode": (flags["stack-upload-mode"] as "cached"|"uncached")
      })
    printResultState(result)
    driver.disconnect(resource)
  }

}
