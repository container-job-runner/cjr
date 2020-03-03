import {flags} from '@oclif/command'
import {JSTools} from '../../lib/js-tools'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {jobCopy, promptUserForJobId, CopyOptions, ContainerRuntime} from "../../lib/functions/run-functions"
import {printResultState} from '../../lib/functions/misc-functions'

export default class Copy extends StackCommand {
  static description = 'Copy job data back into the host directories. Works with both running and completed jobs.'
  static args = [{name: 'id', required: false}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "copy-path": flags.string({description: "overides job default copy path"}),
    explicit: flags.boolean({default: false}),
    verbose: flags.boolean({default: false}),
    mode: flags.string({default: "update", options: ["update", "overwrite", "mirror"], description: 'specify copy mode. "update" copies only newer files, "merge" copies all files, "mirror" copies all files and removes any extranious files'}),
    manual: flags.boolean({default: false, description: "opens an interactive bash shell which allows the user can manually copy individual files"}),
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Copy)
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    // -- set container runtime options ----------------------------------------
    const runtime_options:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit),
      runner:  this.newRunner(flags.explicit)
    }
    // -- get job ids ----------------------------------------------------------
    var ids = argv || JSTools.arrayWrap(await promptUserForJobId(runtime_options.runner, stack_path, "", !this.settings.get('interactive')) || [])
    // -- set copy options -----------------------------------------------------
    const copy_options:CopyOptions = {
      "ids": ids,
      "stack-path": stack_path,
      "mode": (flags.mode as "update"|"overwrite"|"mirror"),
      "verbose": flags.verbose,
    }
    if(flags?.["copy-path"]) copy_options["host-path"] = flags["copy-path"]
    if(flags?.["manual"]) copy_options["manual"] = true
    // -- copy jobs ------------------------------------------------------------
    printResultState(jobCopy(runtime_options, copy_options))
  }

}
