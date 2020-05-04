import { flags } from '@oclif/command'
import { RemoteCommand } from '../../lib/remote/commands/remote-command'
import { OutputOptions, ContainerDrivers, JobOptions, nextAvailablePort } from '../../lib/functions/run-functions'
import { startJupyterApp } from "../../lib/functions/jupyter-functions"
import { printResultState, initX11 } from '../../lib/functions/misc-functions'

export default class Jupyter extends RemoteCommand {
  static description = 'Start a jupiter server for viewing or modifying job\'s files or outputs'
  static args = [{name: 'id', required: true}, {name: 'command', options: ['start', 'stop', 'list', 'url', 'app'], default: 'start'}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    "stack": flags.string({env: 'STACK'}),
    "port": flags.string({default: "auto"}),
    "expose": flags.boolean({default: false}),
    "stack-upload-mode": flags.string({default: "cached", options: ["cached", "uncached"], description: 'specifies how stack is uploaded. "uncached" uploads to new tmp folder while "cached" syncs to a fixed file'}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "protocol": flags.string({exclusive: ['stack-upload-mode', 'build-mode', 'file-access'], char: 'p', description: 'numeric code for rapidly specifying stack-upload-mode, and build-mode'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "x11": flags.boolean({default: false}),
    "tunnel": flags.boolean({default: false, description: "tunnel traffic through ssh port 22"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output from all stages of job', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parse(Jupyter)
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
    const drivers:ContainerDrivers = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.verbose)
    }
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11'] && args['command'] == 'start') await initX11(this.settings.get('interactive'), flags.explicit)
    // -- select port ----------------------------------------------------------
    if(flags['port'] == 'auto') {
      const port_number = nextAvailablePort(drivers.runner, 7027)
      const port_address = (flags.expose) ? '0.0.0.0' : '127.0.0.1'
      flags['port'] = `${port_address}:${port_number}:${port_number}`
    }
    const webapp_path = this.settings.get('webapp');
    if(args['command'] === 'start') // -- start jupyter ------------------------
    {
      // -- set job options ------------------------------------------------------
      const job_options:JobOptions = {
        "stack-path":   stack_path,
        "config-files": flags["config-files"],
        "build-options":this.parseBuildModeFlag(flags["build-mode"]),
        "command":      argv.splice(2).join(" "),
        "cwd":          "",
        "file-access":  "volume",
        "synchronous":  false,
        "x11":          flags.x11,
        "ports":        this.parsePortFlag([flags.port]),
        "labels":       [],
        "remove":       false
      }
      result = driver.jobJupyterStart(resource, drivers, job_options, {
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
    if(args['command'] === 'url' || (!flags['quiet'] && args['command'] === 'start' && !webapp_path)) // -- list jupyter url
    {
      const url_result = driver.jobJupyterUrl(resource, args.id, {mode: (flags['tunnel']) ? 'tunnel' : 'remote'})
      if(url_result.success) console.log(url_result.value)
      result.absorb(url_result)
    }
    if(args['command'] === 'app' || (!flags['quiet'] && args['command'] === 'start' && webapp_path)) // -- start electron app
    {
      const url_result = driver.jobJupyterUrl(resource, args.id, {mode: (flags['tunnel']) ? 'tunnel' : 'remote'})
      if(url_result.success) startJupyterApp(url_result.value, webapp_path || "", flags.explicit)
      result.absorb(url_result)
    }
    printResultState(result)
    driver.disconnect(resource)
  }

}
