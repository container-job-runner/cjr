import { flags } from '@oclif/command'
import { JSTools } from '../../lib/js-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { buildImage } from '../../lib/functions/build-functions'
import { BasicCommand } from '../../lib/commands/basic-command'

export default class Build extends BasicCommand {
  static description = 'Manually build an image for a stack.'
  static args = [{name: 'stack'}]
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "explicit": flags.boolean({default: false}),
    "no-cache": flags.boolean({default: false}),
    "pull": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(Build)
    this.augmentFlagsWithProjectSettings(flags, {"stack": false, "config-files": false, "stacks-dir": true})
    flags["stack"] = args?.['stack'] || flags["stack"]
    this.augmentFlagsWithProfile(flags)

    const stack_list = (flags.stack) ? [ flags.stack ] : []
    const job_manager = this.newJobManager(true, flags.quiet, flags.explicit)
    stack_list.map((stack_name:string) => {
      const init_stack = this.initStackConfiguration({
        "stack": stack_name,
        "config-files": flags["config-files"],
        "stacks-dir": flags["stacks-dir"],
        },
        job_manager.configurations
      )
      if(!init_stack.success)
        return printValidatedOutput(init_stack)
      const stack_configuration = init_stack.value
      if(flags["pull"]) stack_configuration.addBuildFlag('pull')
      if(flags["no-cache"]) stack_configuration.addBuildFlag('no-cache')
      printValidatedOutput(
        buildImage(stack_configuration, job_manager.container_drivers, {"reuse-image": false, verbose: true})
      )
    });
  }

}
