import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { BasicCommand } from '../../lib/commands/basic-command'
import { ShellCommand } from '../../lib/shell-command'

export default class Build extends BasicCommand {
  static description = 'Manually build an image for a stack.'
  static args = [{name: 'stack'}]
  static flags = {
    "resource": flags.string({env: 'RESOURCE'}),
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
    this.augmentFlagsWithProjectSettings(flags, {"stack": false, "stacks-dir": true,  "resource": false})
    flags["stack"] = args?.['stack'] || flags["stack"]
    this.augmentFlagsWithProfile(flags)

    const stack_list = (flags.stack) ? [ flags.stack ] : []
    const job_manager = this.newJobManager(flags['resource'] || "localhost", {verbose: true, quiet: flags.quiet, explicit: flags.explicit})
    stack_list.map((stack_name:string) => {
      const init_stack = this.initStackConfiguration({
        "stack": stack_name,
        "config-files": flags["config-files"],
        "stacks-dir": flags["stacks-dir"],
        },
        job_manager.configurations,
        new ShellCommand(flags.explicit, flags.quiet)
      )
      if(!init_stack.success)
        return printValidatedOutput(init_stack)
      const stack_configuration = init_stack.value
      if(flags["pull"]) stack_configuration.addBuildFlag('pull')
      if(flags["no-cache"]) stack_configuration.addBuildFlag('no-cache')
      printValidatedOutput(
        job_manager.build(stack_configuration, {"reuse-image": false, verbose: true})
      )
    });
  }

}
