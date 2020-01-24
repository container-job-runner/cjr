import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {IfBuiltAndLoaded, bindHostRoot, setRelativeWorkDir, addPorts, jobToImage, enableX11, prependXAuth} from '../lib/functions/run-functions'
import {printResultState} from '../lib/functions/misc-functions'

export default class Shell extends StackCommand {
  static description = 'Start an interactive shell for developing in a stack container.'
  static args = []
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    containerRoot: flags.string({default: false}),
    save: flags.string({default: false, description: "saves new image that contains modifications"}),
    port: flags.string({default: [], multiple: true}),
    x11: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Shell, true)
    const builder  = this.newBuilder(flags.explicit)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)
    // if save is empty overwrite stack image
    if(flags.save === "") flags.save = builder.imageName(stack_path)

    let result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {
        bindHostRoot(configuration, containerRoot, hostRoot);
        setRelativeWorkDir(configuration, containerRoot, hostRoot, process.cwd())
        addPorts(configuration, flags.port)
        if(flags.x11) enableX11(configuration, flags.explicit)

        const job_object = {
          command: (flags.x11) ? prependXAuth("bash", flags.explicit) : "bash",
          hostRoot: false, // set false so that no data copy is performed
          containerRoot: containerRoot,
          synchronous: true,
          removeOnExit: (flags.save !== false) ? false : true
        }

        let result = runner.jobStart(stack_path, job_object, configuration.runObject())
        return result
      })

    if(flags.save !== false) await jobToImage(runner, result, flags.save, true, this.settings.get('interactive'))
    printResultState(result);

  }

}
