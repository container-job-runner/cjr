import {flags} from '@oclif/command'
import {RemoteCommand, Dictionary} from '../../lib/remote/commands/remote-command'
import {Resource} from '../../lib/remote/config/resource-configuration'
import {FileTools} from '../../lib/fileio/file-tools'
import {ValidatedOutput} from '../../lib/validated-output'
import {printResultState} from '../../lib/functions/misc-functions'
import {ErrorStrings} from '../../lib/remote/error-strings'
import {default_remote_storage_dirname} from '../../lib/remote/constants'
import * as path from 'path'

export default class Add extends RemoteCommand {
  static description = 'Add a remote resource.'
  static args  = [{name: 'remote-name', required: true}]
  static flags = {
    type:          flags.string({required: true, options: ['cjr']}),
    address:       flags.string({required: true}),
    username:      flags.string({required: true}),
    key:           flags.string({default:  ""}),
    "copy-key":    flags.boolean({dependsOn: ['key']}),
    "storage-dir": flags.string({description: 'location where job data is stored on remote host.'})
  }
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Add)
    const name = args['remote-name']
    // -- verify that name is unique -------------------------------------------
    if(this.resource_configuration.isResource(name))
      return printResultState(
        new ValidatedOutput(false, [], [ErrorStrings.REMOTE_RESOURCE.NEW.NAME_EXISTS(name)])
      )
    // -- create new entry -----------------------------------------------------
    var new_entry:Resource = {
      type: (flags.type as 'cjr'),
      address: flags.address,
      username: flags.username,
      "storage-dir": flags['storage-dir'] || default_remote_storage_dirname,
      enabled: true
    }
    // -- verify that keyfile exists -------------------------------------------
    if(flags.key && !FileTools.existsFile(flags.key))
      return printResultState(new ValidatedOutput(false, [], [ErrorStrings.REMOTE_RESOURCE.NEW.KEYFILE_NONEXISTANT(flags.key)]))
    // -- save or copy keyfile -------------------------------------------------
    if(flags.key) new_entry.key = path.resolve((flags["copy-key"]) ? this.copyKeyfile(flags.key, this.resource_configuration.numResources()) : flags.key)
    this.resource_configuration.setResource(name, new_entry)
    printResultState(this.resource_configuration.writeToFile())
  }
}
