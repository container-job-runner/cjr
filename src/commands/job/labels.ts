import * as chalk from 'chalk'
import { flags } from '@oclif/command'
import { JSTools } from '../../lib/js-tools'
import { BasicCommand } from '../../lib/commands/basic-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'
import { JobInfo } from '../../lib/drivers-containers/abstract/run-driver'
import { Dictionary } from '../../lib/constants'
import { promptUserForJobId } from '../../lib/functions/cli-functions'

export default class Labels extends BasicCommand {
  static description = 'Retrieve labels for a job.'
  static args = [{name: 'id'}]
  static flags = {
    "resource": flags.string({env: 'RESOURCE'}),
    "label": flags.string({}),
    "all": flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    "json": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Labels)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const job_manager = this.newJobManager(flags['resource'] || 'localhost', {verbose: false, quiet: false, explicit: flags.explicit})
    const runner = job_manager.container_drivers.runner
    const builder = job_manager.container_drivers.builder
    
    const stack_paths = flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    // get id and stack_path
    var job_info:ValidatedOutput<Array<JobInfo>>
    if(flags.all) // -- delete all jobs ----------------------------------------
      job_info = runner.jobInfo({'stack-paths': stack_paths})
    else if(flags["all-completed"]) // -- delete all jobs ----------------------
      job_info = runner.jobInfo({'stack-paths': stack_paths, 'states': ["exited"]})
    else if(flags["all-running"])
      job_info = runner.jobInfo({'stack-paths': stack_paths, 'states': ["running"]})
    else
    {
      const ids = (argv.length > 0) ? argv : (await promptUserForJobId(job_manager, stack_paths, undefined, !this.settings.get('interactive')) || "")
      if(ids === "") return // exit if user selects empty
      job_info = runner.jobInfo({'ids': JSTools.arrayWrap(ids), 'stack-paths': stack_paths})
    }
    if(!job_info.success)
      return (flags.json) ? console.log("{}") : printValidatedOutput(job_info)

    var data:Dictionary = {}
    job_info.value.map((info:JobInfo) => {
      if(flags?.label)
        data[info.id] = info.labels[flags.label]
      else
        data[info.id] = info.labels
    })

    if(flags.json) // -- json output -------------------------------------------
      console.log(JSON.stringify(data))
    else // -- text output -----------------------------------------------------
    {
      const ids = Object.keys(data)
      ids.map((id:string, index:number) => {
        console.log(chalk`{italic id:} ${id}`)
        if(flags.label)
          console.log(chalk`{italic ${flags.label}:} ${data[id]}`)
        else
          Object.keys(data[id]).map((k:string) => console.log(chalk`{italic ${k}:} ${data[id][k]}`))
        if(index < ids.length - 1) console.log("")
      })
    }
  }

}
