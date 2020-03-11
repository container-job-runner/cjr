import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {OutputOptions, ContainerRuntime, JobOptions} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Shell extends RemoteCommand {
  static description = 'Start a shell inside a result. After exiting the changes will be stored as a new result'
  static args = [{name: 'id', required: false}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    label: flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "stack-upload-mode": flags.string({default: "uncached", options: ["cached", "uncached"], description: 'specifies how stack is uploaded. "uncached" uploads to new tmp folder while "cached" syncs to a fixed file'}),
    "build-mode":  flags.string({default: "build", options: ["no-rebuild", "build", "build-nocache"], description: "specify how to build stack. Options are: no-rebuild, build, and build-nocache."}),
    "protocol": flags.string({exclusive: ['stack-upload-mode', 'build-mode', 'file-access'], char: 'p', description: 'numeric code for rapidly specifying stack-upload-mode, build-mode'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'})
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parseWithLoad(Shell, {
      "stack": true,
      "project-root": false,
      "config-files": false,
      "remote-name": true
    })
    this.applyProtocolFlag(flags)
    const stack_path = this.fullStackPath(flags.stack, flags["stacks-dir"])
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
    var driver = this.newRemoteDriver(resource["type"], output_options, false)
    // -- get job id  ----------------------------------------------------------
    var id = args.id || await driver.promptUserForJobId(resource, this.settings.get('interactive')) || ""
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
      "command":      this.settings.get("default_shell"), // NOTE: NO EFFECT for cjr driver (command is overridden by remote cjr)
      "cwd":          flags["working-directory"],
      "file-access":  "volume",
      "synchronous":  true,
      "x11":          flags.x11,
      "ports":        this.parsePortFlag(flags.port),
      "labels":       this.parseLabelFlag(flags.label, flags.message || ""),
      "remove":       true // NOTE: NO EFFECT for cjr driver
    }
    result = driver.jobExec(
      resource,
      runtime_options,
      job_options,
      {
        id: id,
        mode: 'job:shell',
        "host-project-root": flags["project-root"],
        "stack-upload-mode": flags["stack-upload-mode"]
      })
    printResultState(result)
    driver.disconnect(resource)
  }

}
