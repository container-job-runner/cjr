import {flags} from '@oclif/command'
import {RemoteCommand, Dictionary} from '../../lib/remote/commands/remote-command'
import {JSTools} from '../../lib/js-tools'
import {printResultState} from '../../lib/functions/misc-functions'
import {OutputOptions} from '../../lib/functions/run-functions'
import {RemoteDeleteOptions} from '../../lib/remote/drivers/remote-driver'

export default class Delete extends RemoteCommand {
  static description = 'Delete a job and its associated data including the image; works on both running and completed jobs'
  static args = [{name: 'id'}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}), // new remote flag
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    "delete-images": flags.boolean({default: true}),
    "delete-files": flags.boolean({default: true}),
    explicit: flags.boolean({default: false}),
    quiet: flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parse(Delete)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": true})
    // -- validate name --------------------------------------------------------
    const name = (flags['remote-name'] as string)
    var result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  false,
      silent:   flags.quiet,
      explicit: flags.explicit
    }
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    var driver = this.newRemoteDriver(resource["type"], output_options, false)
    // -- get job ids ----------------------------------------------------------
    var ids: Array<string> = []
    var status_filter:undefined|string = undefined
    if(flags.all) status_filter = ""
    else if(flags['all-running']) status_filter = "running"
    else if(flags['all-completed']) status_filter = "exited"

    if(status_filter != undefined) { // filter existing jobs on resource -------
      result = driver.jobInfo(resource, status_filter)
      if(!result.success) return printResultState(result)
      ids = result.data.map((x:Dictionary) => x.id)
    }
    else { // use args or prompt user for input --------------------------------
      ids = (argv.length > 0) ? argv : JSTools.arrayWrap(
        await driver.promptUserForJobId(
          resource,
          this.settings.get('interactive')
        ) || [])
    }
    // -- set copy options -----------------------------------------------------
    const delete_options:RemoteDeleteOptions = {
      "ids": ids,
      "delete-images": flags['delete-images'],
      "delete-files": flags['delete-files']
    }
    driver.jobDelete(resource, delete_options)
    driver.disconnect(resource)
  }

}
