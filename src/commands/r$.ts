import {flags} from '@oclif/command'
import {RemoteCommand} from '../lib/remote/commands/remote-command'
import {printResultState} from '../lib/functions/misc-functions'

export default class Run extends RemoteCommand {
  static description = 'Run a command as a new job on a remote resource.'
  static args   = []
  static flags = {
    remoteName: flags.string({env: 'REMOTENAME'}), // new remote flag
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    configFiles: flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    silent: flags.boolean({default: false}),
    verbose: flags.boolean({default: false, description: 'shows upload progress'}),
    async: flags.boolean({default: false}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false}),
    autocopy: flags.boolean({default: false, exclusive: ["async", "autocopy-all"], description: "automatically copy files back to hostRoot on exit"}),
    "autocopy-all": flags.boolean({default: false, exclusive: ["async", "autocopy"], description: "automatically copy all files results back to hostRoot on exit"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = false;

  async run() {
    const {flags, args, argv} = this.parseWithLoad(Run, {stack:true, configFiles: false, hostRoot:false, remoteName: true})
    const stack_path = this.fullStackPath(flags.stack)
    const resource_config = this.readResourceConfig()
    // -- validate id ----------------------------------------------------------
    var result = this.validResourceName(flags["remoteName"], resource_config)
    if(!result.success) return printResultState(result)
    const remote_name = result.data
    // -- get resource & driver ------------------------------------------------
    const resource = resource_config[remote_name]
    const driver = this.newRemoteDriver(resource["type"], flags.explicit, flags.silent, flags.verbose)
    const builder = this.newBuilder(flags.explicit)
    result = driver.jobStart(
      resource,
      builder,
      stack_path,
      flags.configFiles,
      flags, args, argv
    )
    printResultState(result)
  }
}
