import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Shell extends RemoteCommand {
  static description = 'Start a shell inside a result. After exiting the changes will be stored as a new result'
  static args = [{name: 'id', required: false}]
  static flags = {
    remoteName: flags.string({env: 'REMOTENAME'}), // new remote flag
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    configFiles: flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    discard: flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parseWithLoad(Shell, {stack:true, configFiles: false, hostRoot:false, remoteName: true})
    const stack_path = this.fullStackPath(flags.stack)
    const resource_config = this.readResourceConfig()
    // -- validate id ----------------------------------------------------------
    var result = this.validResourceName(flags["remoteName"], resource_config)
    if(!result.success) return printResultState(result)
    const remote_name = result.data
    // -- get resource & driver ------------------------------------------------
    const resource = resource_config[remote_name]
    const driver = this.newRemoteDriver(resource["type"], flags.explicit, flags.silent, flags.verbose)
    const job_id = argv[0] || await driver.promptUserForJobId(resource, this.settings.get('interactive')) || ""
    const builder = this.newBuilder(flags.explicit)
    result = driver.jobShell(
      resource,
      builder,
      stack_path,
      flags.configFiles,
      flags, {id: job_id}, [job_id]
    )
    printResultState(result)
  }

}
