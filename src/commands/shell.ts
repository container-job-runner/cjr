import {flags} from '@oclif/command'
import {StackCommand} from '../lib/commands/stack-command'
import {containerWorkingDir, IfBuiltAndLoaded} from '../lib/functions/run-functions'
import * as path from 'path'

export default class Shell extends StackCommand {
  static description = 'Start an interactive shell for developing in a stack container.'
  static args = []
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    containerRoot: flags.string({default: false}),
    save: flags.string({default: false, description: "saves new image that contains modifications"}),
    port: flags.string({default: false, multiple: true})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(Shell, true)
    const builder  = this.newBuilder(flags.explicit)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    let result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {

        if(hostRoot)
        {
           const hostRoot_basename = path.basename(hostRoot)
           configuration.addBind(hostRoot, path.posix.join(containerRoot, hostRoot_basename))
           const ced = containerWorkingDir(process.cwd(), hostRoot, containerRoot)
           if(ced) configuration.setWorkingDir(ced)
        }

        // add any optional ports to configuration
        if(flags?.port) {
          const valid_ports = flags.port.map(e => parseInt(e))?.filter(e => !isNaN(e) && e >= 0)
          valid_ports.map(p => configuration.addPort(p, p))
        }

        const job_object =
        {
          command: `bash`,
          hostRoot: false, // set false so that no data copy is performed
          containerRoot: containerRoot,
          synchronous: true,
          removeOnExit: (flags.save !== false) ? false : true
        }

        let result = runner.jobStart(stack_path, job_object, configuration.runObject())
        if(flags.save !== false && result.success) {
          runner.resultToImage(result.data, flags['save'], stack_path)
          runner.resultDelete([result.data])
        }
        return result
      })
    this.handleFinalOutput(result);
  }

}
