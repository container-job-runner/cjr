import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { JSTools } from '../../lib/js-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { buildImage } from '../../lib/functions/build-functions'

export default class Build extends BasicCommand {
  static description = 'Manually build images for one or more stacks.'
  static args = [{name: 'stack'}]
  static flags = {
    "stack": flags.string({env: 'STACK', multiple: true}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "explicit": flags.boolean({default: false}),
    "no-cache": flags.boolean({default: false}),
    "pull": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Build)
    this.augmentFlagsWithProjectSettings(flags, {"stack": false, "config-files": false, "stacks-dir": true})
    const stack_list = (argv.length > 0) ? argv : (JSTools.arrayWrap(flags.stack) || []) // add arrayWrap since parseWithLoad will return scalar
    const { container_drivers, configurations } = this.initContainerSDK(true, flags.quiet, flags.explicit)
    stack_list.map((stack_name:string) => {
      const init_stack = this.initStackConfiguration({
        "stack": stack_name,
        "config-files": flags["config-files"],
        "stacks-dir": flags["stacks-dir"],
        },
        configurations
      )
      if(!init_stack.success)
        return printValidatedOutput(init_stack)
      const stack_configuration = init_stack.value
      if(flags["pull"]) stack_configuration.addBuildFlag('pull')
      if(flags["no-cache"]) stack_configuration.addBuildFlag('no-cache')
      printValidatedOutput(
        buildImage(stack_configuration, container_drivers, {"reuse-image": false, verbose: true})
      )
    });
  }

}
