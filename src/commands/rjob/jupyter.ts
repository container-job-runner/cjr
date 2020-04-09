import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {OutputOptions, ContainerRuntime, JobOptions} from '../../lib/functions/run-functions'
import {startJupyterApp} from "../../lib/functions/jupyter-functions"
import {printResultState} from '../../lib/functions/misc-functions'

export default class Exec extends RemoteCommand {
  static description = 'Start a shell inside a result. After exiting the changes will be stored as a new result'
  static args = [{name: 'id', required: true}, {name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    stack: flags.string({env: 'STACK'}),
    port: flags.integer({default: 8888, exclusive: ['stop', 'list', 'app']}),
    "stack-upload-mode": flags.string({default: "uncached", options: ["cached", "uncached"], description: 'specifies how stack is uploaded. "uncached" uploads to new tmp folder while "cached" syncs to a fixed file'}),
    "build-mode":  flags.string({default: "no-rebuild", options: ["no-rebuild", "build", "build-nocache"], description: "specify how to build stack. Options are: no-rebuild, build, and build-nocache."}),
    "protocol": flags.string({exclusive: ['stack-upload-mode', 'build-mode', 'file-access'], char: 'p', description: 'numeric code for rapidly specifying stack-upload-mode, and build-mode'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    x11: flags.boolean({default: false}),
    "tunnel": flags.boolean({default: false}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    verbose: flags.boolean({default: false, description: 'prints output from stack build output and id'}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parse(Exec)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": (args?.['command'] === 'start'), // only require stack for start
      "project-root": false,
      "config-files": false,
      "remote-name": true
    })
    this.applyProtocolFlag(flags)
    const stack_path = this.fullStackPath((flags.stack as string), flags["stacks-dir"] || "")
    // -- validate name --------------------------------------------------------
    const name = (flags['remote-name'] as string)
    var result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   false,
      explicit: flags.explicit
    }
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const driver = this.newRemoteDriver(resource["type"], output_options, false)
    // -- set container runtime options ----------------------------------------
    const container_runtime:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.verbose)
    }

    const jupyter_app = this.settings.get('jupyter_app');
    if(args['command'] === 'start') // -- start jupyter ------------------------
    {
      // -- set job options ------------------------------------------------------
      const job_options:JobOptions = {
        "stack-path":   stack_path,
        "config-files": flags["config-files"],
        "build-mode":   (flags["build-mode"] as "no-rebuild"|"build"|"build-nocache"),
        "command":      argv.splice(2).join(" "),
        "cwd":          "",
        "file-access":  "volume",
        "synchronous":  false,
        "x11":          flags.x11,
        "ports":        [{containerPort: flags['port'], hostPort: flags['port']}],
        "labels":       [],
        "remove":       false
      }
      result = driver.jobJupyterStart(resource, container_runtime, job_options, {
        id: args['id'],
        tunnel: flags['tunnel'],
        "host-project-root": flags["project-root"] || "",
        "stack-upload-mode": (flags["stack-upload-mode"] as "cached"|"uncached")
      })
    }
    if(args['command'] === 'stop') // -- stop jupyter --------------------------
    {
      driver.jobJupyterStop(resource, args.id)
    }
    if(args['command'] === 'list') // -- list jupyter --------------------------
    {
      driver.jobJupyterList(resource, args.id)
    }
    if(args['command'] === 'url' || (args['command'] === 'start' && !jupyter_app)) // -- list jupyter url
    {
      const url_result = driver.jobJupyterUrl(resource, args.id, {mode: (flags['tunnel']) ? 'tunnel' : 'remote'})
      if(url_result.success) console.log(url_result.data)
      result.absorb(url_result)
    }
    if(args['command'] === 'app' || (args['command'] === 'start' && jupyter_app)) // -- start electron app
    {
      const url_result = driver.jobJupyterUrl(resource, args.id, {mode: (flags['tunnel']) ? 'tunnel' : 'remote'})
      if(url_result.success) startJupyterApp(url_result.data, jupyter_app || "", flags.explicit)
      result.absorb(url_result)
    }
    printResultState(result)
    driver.disconnect(resource)
  }

}
