import {flags} from '@oclif/command'
import {StackCommand} from '../../lib/commands/stack-command'
import {ShellCommand} from '../../lib/shell-command'
import {printResultState, startJupyterApp} from '../../lib/functions/misc-functions'
import {ValidatedOutput} from '../../lib/validated-output'
import {jobNameLabeltoID} from '../../lib/functions/run-functions'
import {JUPYTER_JOB_NAME} from '../../lib/constants'

export default class App extends StackCommand {
  static description = 'start the Jupyter app.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(App)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "stacks-dir": false})
    const runner  = this.newRunner(flags.explicit)
    const stack_path = this.fullStackPath((flags.stack as string), flags["stacks-dir"] || "")
    const jupyter_id = jobNameLabeltoID(runner, JUPYTER_JOB_NAME, stack_path, "running");
    var result: ValidatedOutput;

    if(jupyter_id === false)
    {
      result = new ValidatedOutput(false).pushError(`Jupyter is not running.`);
    }
    else if(!this.settings.get('jupyter_app'))
    {
      result = new ValidatedOutput(false).pushError(`jupyter_app setting has not been set.`);
    }
    else
    {
      result = await startJupyterApp(
        runner,
        new ShellCommand(flags.explicit, false),
        jupyter_id,
        this.settings.get('jupyter_app') || ""
      )
    }
    printResultState(result)
  }

}
