import { flags } from '@oclif/command'
import { printResultState } from '../../lib/functions/misc-functions'
import { BasicCommand } from '../../lib/commands/basic-command'
import { stopJupyter } from '../../lib/functions/jupyter-functions'

export default class Stop extends BasicCommand {
  static description = 'Stop a running Jupyter server.'
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
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
    const result = stopJupyter(job_manager, {
      "project-root": flags['project-root']
    });
    printResultState(result)
  }

}
