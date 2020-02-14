import {flags} from '@oclif/command'
import {RemoteCommand} from '../../lib/remote/commands/remote-command'
import {JSTools} from '../../lib/js-tools'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Delete extends RemoteCommand {
  static description = 'Delete a job and its associated data. This command works on both running and completed jobs'
  static args = [{name: 'id'}]
  static flags = {
    remoteName: flags.string({env: 'REMOTENAME'}), // new remote flag
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    silent: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parseWithLoad(Delete, {remoteName: true})
    const resource_config = this.readResourceConfig()
    // -- validate id ----------------------------------------------------------
    var result = this.validResourceName(flags.remoteName || "", resource_config)
    if(!result.success) return printResultState(result)
    const resource_name = result.data
    // -- get resource & driver ------------------------------------------------
    const resource = resource_config[resource_name]
    const driver = this.newRemoteDriver(resource["type"], flags.explicit, flags.silent, false)
    if(!flags.all && !flags['all-running'] && !flags['all-completed']) {
      const job_id = (argv.length > 0) ? argv : (await driver.promptUserForJobId(resource, this.settings.get('interactive')) || "")
      if(job_id === "") return // exit if user selects empty
      this.remoteCommand("jobDelete", flags, {}, JSTools.arrayWrap(job_id))
    }
    else this.remoteCommand("jobDelete", flags, args, argv)
  }

}
