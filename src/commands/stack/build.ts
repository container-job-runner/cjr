import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Build extends StackCommand {
  static description = 'Build an image cooresponding to a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    configFiles: flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    silent:   flags.boolean({default: false}),
    nocache:  flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Build, {stack:true, configFiles: false})
    const builder = this.newBuilder(flags.explicit, flags.silent)
    const stack_path = this.fullStackPath(flags.stack)
    const result = builder.build(stack_path, flags.configFiles, flags['nocache'])
    printResultState(result)
  }

}
