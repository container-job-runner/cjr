import { flags} from '@oclif/command'
import { JSTools} from '../../lib/js-tools'
import { StackCommand } from '../../lib/commands/stack-command'
import { jobCopy, promptUserForJobId, CopyOptions, ContainerDrivers } from "../../lib/functions/run-functions"
import { printResultState } from '../../lib/functions/misc-functions'

export default class Copy extends StackCommand {
  static description = 'Copy job files back into the host directories; works on both running and completed jobs.'
  static args = [{name: 'id', required: false}]
  static flags = {
    "copy-path": flags.string({description: "overides job default copy path"}),
    "mode": flags.string({default: "update", options: ["update", "overwrite", "mirror"], description: 'specify copy mode. "update" copies only newer files, "merge" copies all files, "mirror" copies all files and removes any extranious files'}),
    "manual": flags.boolean({default: false, description: "opens an interactive bash shell which allows the user can manually copy individual files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output from rsync', exclusive: ['quiet']}),
    "quiet":flags.boolean({default: false, char: 'q'}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Copy)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    // -- set container runtime options ----------------------------------------
    const drivers:ContainerDrivers = {
      builder: this.newBuilder(flags.explicit, flags.quiet),
      runner:  this.newRunner(flags.explicit, flags.quiet)
    }
    // -- get job ids ----------------------------------------------------------
    var ids = (argv.length > 0) ? argv : JSTools.arrayWrap(await promptUserForJobId(drivers.runner, stack_paths, undefined, !this.settings.get('interactive')) || [])
    if(ids.length == 0) return // exit if ids are empty or if user exits interactive dialog
    // -- set copy options -----------------------------------------------------
    const copy_options:CopyOptions = {
      "ids": ids,
      "stack-paths": stack_paths,
      "mode": (flags.mode as "update"|"overwrite"|"mirror"),
      "verbose": flags.verbose,
    }
    if(flags?.["copy-path"]) copy_options["host-path"] = flags["copy-path"]
    if(flags?.["manual"]) copy_options["manual"] = true
    // -- copy jobs ------------------------------------------------------------
    printResultState(jobCopy(drivers, copy_options))
  }

}
