import {flags} from '@oclif/command'
import {RemoteCommand, Dictionary} from '../../lib/remote/commands/remote-command'
import {FileTools} from '../../lib/fileio/file-tools'
import {ValidatedOutput} from '../../lib/validated-output'
import {printResultState} from '../../lib/functions/misc-functions'
import {ErrorStrings} from '../../lib/remote/error-strings'
import {default_remote_storage_dirname} from '../../lib/remote/constants'
import * as path from 'path'

export default class Add extends RemoteCommand {
  static description = 'Add a remote resource.'
  static args  = []
  static flags = {
    name:          flags.string({required: true}),
    type:          flags.string({required: true}),
    address:       flags.string({required: true}),
    username:      flags.string({required: true}),
    key:           flags.string({}),
    "copy-key":    flags.boolean({dependsOn: ['key']}),
    "storage-dir": flags.string({description: 'location where job data is stored on remote host.'})
  }
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Add)
    const resource_config = this.readResourceConfig()
    // -- verify that name is unique -------------------------------------------
    if(resource_config.hasOwnProperty(flags.name))
      return printResultState(
        new ValidatedOutput(false, [], [ErrorStrings.NEWENTRY.NAME_EXISTS(flags.name)])
      )
    // -- create new entry -----------------------------------------------------
    var new_entry:Dictionary = {
      type: flags.type,
      address: flags.address,
      username: flags.username,
      "storage-dir": flags['storage-dir'] || default_remote_storage_dirname,
      enabled: true
    }
    // -- verify that keyfile exists -------------------------------------------
    if(flags.key && !FileTools.existsFile(flags.key))
      return printResultState(new ValidatedOutput(false, [], [ErrorStrings.NEWENTRY.KEYFILE_NONEXISTANT(flags.key)]))
    // -- save or copy keyfile -------------------------------------------------
    if(flags.key) new_entry.key = path.resolve((flags["copy-key"]) ? this.copyKeyfile(flags.key, Object.keys(resource_config).length) : flags.key)
    resource_config[flags.name] = new_entry
    printResultState(this.writeResourceConfig(resource_config))
  }
}
