import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ServerCommand } from '../../lib/commands/server-command'
import { stopJupyter, stopAllJupyters } from '../../lib/functions/jupyter-functions'
import { ValidatedOutput } from '../../lib/validated-output'
import { LocalJobManager } from '../../lib/job-managers/local/local-job-manager'

export default class Stop extends ServerCommand {
  static description = 'Stop a running Jupyter server.'
  static args = [ { name: "project-root" } ]
  static flags = {
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "resource": flags.string({env: 'RESOURCE'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "all": flags.boolean({description: "stop all jupyter servers running in host directories"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const { args, flags } = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"project-root": false})
    this.augmentFlagsWithProjectRootArg(args, flags)
    this.augmentFlagsWithHere(flags)

    const job_manager = this.newJobManager(flags["resource"] || 'localhost', {
        verbose: flags['verbose'], 
        quiet: flags['quiet'], 
        explicit: flags['explicit']
    })
    let result:ValidatedOutput<undefined>;
    if(flags['all'])
      result = stopAllJupyters(
          job_manager, 
          (job_manager instanceof LocalJobManager) ? false : this.settings.get("autocopy-on-service-exit"),
          "in-project"
        )
    else
      result = stopJupyter(
        job_manager, 
        (job_manager instanceof LocalJobManager) ? false : this.settings.get("autocopy-on-service-exit"),
        { "project-root": flags['project-root'] }
      );
    printValidatedOutput(result)
  }

}
