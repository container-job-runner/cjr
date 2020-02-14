import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Copy extends RemoteCommand {
  static description = 'Copy job data back into the host directories. Works with both running and completed jobs.'
  static args = [{name: 'id', required: false}]
  static flags = {
    remoteName: flags.string({env: 'REMOTENAME'}), // new remote flag
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    silent: flags.boolean({default: false}),
    verbose: flags.boolean({default: false, description: 'shows upload progress'}),
    force: flags.boolean({default: false, description: 'force copy into any directory'}),
    all: flags.boolean({default: false}),
  }
  static strict = true;

  async run()
  {
    const {flags, args, argv} = this.parseWithLoad(Copy, {hostRoot:true, remoteName: true})
    const resource_config = this.readResourceConfig()
    // -- validate id ----------------------------------------------------------
    var result = this.validResourceName(flags.remoteName || "", resource_config)
    if(!result.success) return printResultState(result)
    const resource_name = result.data
    // -- get resource & driver ------------------------------------------------
    const resource = resource_config[resource_name]
    const driver = this.newRemoteDriver(resource["type"], flags.explicit, flags.silent, flags.verbose)
    const job_id = argv[0] || await driver.promptUserForJobId(resource, this.settings.get('interactive')) || ""
    printResultState(driver.jobCopy(resource, flags, {id: job_id}, [job_id]))
  }

}
