import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {JSTools} from '../../lib/js-tools'
import {ErrorStrings} from '../../lib/error-strings'
import {printResultState} from '../../lib/functions/misc-functions'

export default class RMI extends StackCommand {
  static description = 'Delete an image for any number of stacks.'
  static args = [{name:'stack'}]
  static flags = {
    stack: flags.string({env: 'STACK', multiple: true}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    silent:   flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(RMI, {stack:false})
    const stack_list = (argv.length > 0) ? argv : ([flags.stack] || [])
    const builder = this.newBuilder(flags.explicit, flags.silent)
    stack_list.map((stack_name:string) => {
      const stack_path = this.fullStackPath(stack_name)
      if(!flags.silent) console.log(ErrorStrings.STACK.NO_STACK_SPECIFIED(stack_name, stack_path))
      printResultState(builder.removeImage(stack_path))
    });
  }

}
