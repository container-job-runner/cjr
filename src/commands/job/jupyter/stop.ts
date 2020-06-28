import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../../lib/functions/misc-functions'
import { BasicCommand } from '../../../lib/commands/basic-command'
import { stopJupyter, stopAllJupyters } from '../../../lib/functions/jupyter-functions'

export default class Stop extends BasicCommand {
  static description = 'Stop a running Jupyter server.'
  static args = [{name: 'id', default: ""}]
  static flags = {
    "resource": flags.string({default: 'localhost', env: 'RESOURCE'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "all": flags.boolean({description: "stop all jupyter servers running in host directories"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"})
  }
  static strict = false;

  async run()
  {
    const { args, flags } = this.parse(Stop)
    this.augmentFlagsWithProjectSettings(flags, {"project-root": false})
    this.augmentFlagsWithHere(flags)
    const job_manager = this.newJobManager(flags['verbose'], flags['quiet'], flags['explicit'])

    if(flags['all'])
      return printValidatedOutput(
        stopAllJupyters(job_manager, "in-job")
      )
    // -- get job ids --------------------------------------------------------
    const job_id = await this.getJobId([args['id']], flags)
    if(job_id === false) return // exit if user selects empty id or exits interactive dialog
    printValidatedOutput(
      stopJupyter(job_manager, {"job-id": job_id})
    )
  }

}
