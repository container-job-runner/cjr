import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { JobCommand } from '../../lib/commands/job-command'

export default class Build extends JobCommand {
  static description = 'Manually build an image for a stack.'
  static args = [{name: 'stack'}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "stack": flags.string({env: 'CJR_STACK'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "debug": flags.boolean({default: false}),
    "no-cache": flags.boolean({default: false}),
    "pull": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = false;

  async run()
  {
    const {args, flags} = this.parse(Build)
    this.augmentFlagsWithProjectSettings(flags, {"stack": false, "stacks-dir": true,  "resource": false})
    flags["stack"] = args?.['stack'] || flags["stack"]
    this.augmentFlagsWithProfile(flags)

    const stack_list = (flags.stack) ? [ flags.stack ] : []
    const build_modes: string[] = []
    if( flags["pull"] ) build_modes.push("pull")
    if( flags["no-cache"] ) build_modes.push("no-cache")
    const build_mode = build_modes.join(",");

    stack_list.map((stack_name:string) => {
        const stack_data = this.createStack({ ... flags, ... { verbose: true, stack: stack_name, 'build-mode' : build_mode }})
        if( ! stack_data.success ) return printValidatedOutput(stack_data)
        const { job_manager, stack_configuration } = stack_data.value
        printValidatedOutput(
             job_manager.build(stack_configuration, {"reuse-image": false, verbose: true})
        )
    });
  }

}
