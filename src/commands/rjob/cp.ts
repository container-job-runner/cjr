import { flags} from '@oclif/command'
import { RemoteCommand } from '../../lib/remote/commands/remote-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { JSTools } from '../../lib/js-tools'
import { OutputOptions, CopyOptions } from '../../lib/remote/compatibility'

export default class Copy extends RemoteCommand {
  static description = 'Copy remote job files back into the host directories. Works with both running and completed jobs.'
  static args = [{name: 'id', required: false}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}), // new remote flag
    "project-root": flags.string({env: 'PROJECTROOT', description: "location for copy operation"}),
    mode: flags.string({default: "update", options: ["update", "overwrite", "mirror"], description: 'specify copy mode. "update" copies only newer files, "merge" copies all files, "mirror" copies all files and removes any extranious files'}),
    manual: flags.boolean({default: false, description: "opens an interactive bash shell which allows the user can manually copy individual files"}),
    force: flags.boolean({default: false, description: 'force copy into any directory even if it differs from original project root'}),
    explicit: flags.boolean({default: false}),
    quiet: flags.boolean({default: false, char: 'q'}),
    verbose: flags.boolean({default: false, char: 'v', description: 'shows output from rsync'})
  }
  static strict = true;

  async run()
  {
    const {flags, argv} = this.parse(Copy)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true, "remote-name": true})
    // -- validate name --------------------------------------------------------
    const name = (flags['remote-name'] as string)
    var result = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- set output options ---------------------------------------------------
    const output_options:OutputOptions = {
      verbose:  flags.verbose,
      silent:   flags.quiet,
      explicit: flags.explicit
    }
    // -- get resource & driver ------------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    var driver = this.newRemoteDriver(resource["type"], output_options, false)
    // -- get job ids ----------------------------------------------------------
    var ids = (argv.length > 0) ? argv : JSTools.arrayWrap(await driver.promptUserForJobId(resource, this.settings.get('interactive')) || [])
    // -- set copy options -----------------------------------------------------
    const copy_options:CopyOptions = {
      "ids": ids,
      "host-path": flags["project-root"],
      "mode": (flags.mode as "update"|"overwrite"|"mirror"),
      "verbose": flags.verbose,
      "force": flags.force
    }
    if(flags?.["manual"]) copy_options["manual"] = true
    // -- copy jobs ------------------------------------------------------------
    printValidatedOutput(driver.jobCopy(resource, copy_options))
    driver.disconnect(resource)
  }

}
