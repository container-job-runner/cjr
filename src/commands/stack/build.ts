import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {JSTools} from '../../lib/js-tools'
import {ErrorStrings} from '../../lib/error-strings'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Build extends StackCommand {
  static description = 'Build the images for any number of stacks.'
  static args = [{name: 'stack'}]
  static flags = {
    stack: flags.string({env: 'STACK', multiple: true}),
    configFiles: flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    silent:   flags.boolean({default: false}),
    "no-cache":  flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Build, {stack:false, configFiles: false})
    const stack_list = (argv.length > 0) ? argv : (flags.stack || [])
    //if(!stack) return printResultState(new ValidatedOutput(false, [], [ErrorString.STACK.NO_STACK_SPECIFIED]))
    const builder = this.newBuilder(flags.explicit, flags.silent)
    stack_list.map((stack_name:string) => {
      const stack_path = this.fullStackPath(stack_name)
      printResultState(builder.build(stack_path, flags.configFiles || [], flags['no-cache']))
    });
  }

}
