import { flags } from '@oclif/command'
import { StackCommand } from '../../lib/commands/stack-command'
import { JSTools } from '../../lib/js-tools'
import { printResultState } from '../../lib/functions/misc-functions'

export default class RMI extends StackCommand {
  static description = 'Delete an image one or more stacks.'
  static args = [{name:'stack'}]
  static flags = {
    "stack": flags.string({env: 'STACK', multiple: true}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "explicit": flags.boolean({default: false}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "all-configurations": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { argv, flags } = this.parse(RMI)
    this.augmentFlagsWithProjectSettings(flags, {stack:false, "stacks-dir": false, "config-files": false})
    const stack_list = (argv.length > 0) ? argv : (JSTools.arrayWrap(flags.stack) || []) // add arrayWrap since parseWithLoad will return scalar
    const { container_drivers, configurations } = this.initContainerSDK(true, flags.quiet, flags.explicit)
    // -- map through list and remove ------------------------------------------
    stack_list.map((stack_name:string) => {
      const stack_path = this.fullStackPath(stack_name, flags["stacks-dir"])
      if(flags["all-configurations"]) // -- remove based on stack_path ---------
        container_drivers.builder.removeAllImages(stack_path)
      else { // -- remove only current configuration ---------------------------
        const init_stack = this.initStackConfiguration({
          "stack": stack_name,
          "config-files": flags["config-files"],
          "stacks-dir": flags["stacks-dir"],
          },
          configurations
        )
        if(!init_stack.success)
          return printResultState(init_stack)
        printResultState(container_drivers.builder.removeImage(init_stack.value))
      }
    });
  }

}
