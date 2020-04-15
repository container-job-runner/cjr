import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {JSTools} from '../../lib/js-tools'
import {ErrorStrings} from '../../lib/error-strings'
import {printResultState} from '../../lib/functions/misc-functions'
import {removeImage} from '../../lib/functions/build-functions'

export default class RMI extends StackCommand {
  static description = 'Delete an image one or more stacks.'
  static args = [{name:'stack'}]
  static flags = {
    stack: flags.string({env: 'STACK', multiple: true}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "all-configurations": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(RMI)
    this.augmentFlagsWithProjectSettings(flags, {stack:false, "stacks-dir": false, "config-files": false})
    const stack_list = (argv.length > 0) ? argv : (JSTools.arrayWrap(flags.stack) || []) // add arrayWrap since parseWithLoad will return scalar
    const builder = this.newBuilder(flags.explicit, flags.quiet)
    stack_list.map((stack_name:string) => {
      const stack_path = this.fullStackPath(stack_name, flags["stacks-dir"])
      removeImage(builder, stack_path, flags['all-configurations'], flags['config-files'])
    });
  }

}
