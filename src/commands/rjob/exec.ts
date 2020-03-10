import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {OutputOptions, ContainerRuntime, JobOptions} from '../../lib/functions/run-functions'
import {RunShortcuts} from "../../lib/config/run-shortcuts/run-shortcuts"
import {printResultState} from '../../lib/functions/misc-functions'

export default class Exec extends RemoteCommand {
  static description = 'Start a shell inside a result. After exiting the changes will be stored as a new result'
  static args = [{name: 'id', required: true}, {name: 'command', required: true}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    label: flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "build-mode":  flags.string({default: "build", options: ["no-rebuild", "build", "build-nocache"], description: "specify how to build stack. Options are: no-rebuild, build, and build-nocache."}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parseWithLoad(Exec, {
      "stack": true,
      "project-root": true,
      "config-files": false,
      "remote-name": true
    })
    const stack_path = this.fullStackPath(flags.stack, flags["stacks-dir"])
    // -- initialize run shortcuts ---------------------------------------------
    const run_shortcut = new RunShortcuts()
    const rs_result = run_shortcut.loadFromFile(this.settings.get('run_shortcuts_file'))
    if(!rs_result.success) printResultState(rs_result)
    // -- validate name --------------------------------------------------------
    const name = flags['remote-name']
    var result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   false,
      explicit: flags.explicit
    }
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const driver = this.newRemoteDriver(resource["type"], output_options)
    // -- get job id  ----------------------------------------------------------
    const id = args.id || await driver.promptUserForJobId(resource, this.settings.get('interactive')) || ""
    // -- set container runtime options ----------------------------------------
    const runtime_options:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.silent)
    }
    // -- set job options ------------------------------------------------------
    const command = run_shortcut.apply(argv.splice(1)).join(" ")
    const job_options:JobOptions = {
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "build-mode":   flags["build-mode"],
      "command":      command,
      "cwd":          flags["working-directory"],
      "file-access":  "volume",
      "synchronous":  !flags["async"],
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       this.parseLabelFlag(flags.label, flags.message || ""),
      "remove":       false
    }
    result = driver.jobExec(resource, runtime_options, job_options, {id: id, mode: 'job:exec', "host-project-root": flags["project-root"]})
    printResultState(result)
  }

}