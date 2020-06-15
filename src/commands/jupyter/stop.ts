import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { BasicCommand } from '../../lib/commands/basic-command'
import { stopJupyter, stopAllJupyters } from '../../lib/functions/jupyter-functions'
import { ValidatedOutput } from '../../lib/validated-output'

export default class Stop extends BasicCommand {
  static description = 'Stop a running Jupyter server.'
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "all": flags.boolean({description: "stop all jupyter servers running in host directories"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { flags } = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"project-root": false})
    this.augmentFlagsWithHere(flags)

    const { job_manager } = this.initContainerSDK(flags['verbose'], flags['quiet'], flags['explicit'])
    let result:ValidatedOutput<undefined>;
    if(flags['all'])
      result = stopAllJupyters(job_manager, "in-project")
    else
      result = stopJupyter(job_manager, {
        "project-root": flags['project-root']
      });
    printValidatedOutput(result)
  }

}
