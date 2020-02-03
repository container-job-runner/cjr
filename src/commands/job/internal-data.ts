import {flags} from '@oclif/command'
import * as chalk from 'chalk'
import {JobCommand, Dictionary} from '../../lib/commands/job-command'
import {matchingJobIds, promptUserForJobId, allJobIds} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class InternalData extends JobCommand {
  static description = 'Retrieve internal cli data for a job.'
  static args = [{name: 'id'}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    json: flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(InternalData)
    const runner  = this.newRunner(flags.explicit)
    // get id and stack_path
    var stack_path = (flags.stack) ? this.fullStackPath(flags.stack) : ""
    var ids
    if(flags.all) // -- select all jobs ----------------------------------------
      ids = allJobIds(runner, stack_path)
    else if(flags["all-completed"]) // -- select all completed jobs ------------
      ids = allJobIds(runner, stack_path, "exited")
    else if(flags["all-running"])
      ids = allJobIds(runner, stack_path, "running")
    else  // -- stop only jobs specified by user -------------------------------
    {
      var id = argv[0] || await promptUserForJobId(runner, stack_path, "", !this.settings.get('interactive')) || ""
      var result = matchingJobIds(runner, id, stack_path)
      if(result.success) ids = result.data
      else return printResultState(result)
    }

    var data:Dictionary = {}
    ids.map((id:string) => {
      var result = this.job_json.read(id)
      data[id] = (result.success) ? result.data : {}
    })

    if(flags.json) // -- json output -------------------------------------------
      console.log(JSON.stringify(data))
    else // -- text output -----------------------------------------------------
    {
      ids.map((id:string, index:number) => {
        console.log(chalk`{italic id:} ${id}`)
        Object.keys(data[id]).map((k:string) => console.log(chalk`{italic ${k}:} ${data[id][k]}`))
        if(index < ids.length - 1) console.log("")
      })
    }
  }

}
