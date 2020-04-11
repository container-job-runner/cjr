import {flags} from '@oclif/command'
import * as chalk from 'chalk'
import {JSTools} from '../../lib/js-tools'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {matchingJobInfo, promptUserForJobId, allJobIds} from '../../lib/functions/run-functions'
import {printResultState} from '../../lib/functions/misc-functions'

export default class Labels extends StackCommand {
  static description = 'Retrieve labels for a job.'
  static args = [{name: 'id'}]
  static flags = {
    label: flags.string({}),
    all: flags.boolean({default: false}),
    "all-completed": flags.boolean({default: false}),
    "all-running": flags.boolean({default: false}),
    json: flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({default: [], multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    explicit: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Labels)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner = this.newRunner(flags.explicit)
    var stack_paths = flags['visible-stacks'].map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    // get id and stack_path
    var job_info
    if(flags.all) // -- select all jobs ----------------------------------------
      job_info = runner.jobInfo(stack_paths)
    else if(flags["all-completed"]) // -- select all completed jobs ------------
      job_info = runner.jobInfo(stack_paths, ["exited"])
    else if(flags["all-running"])
      job_info = runner.jobInfo(stack_paths, ["running"])
    else  // -- stop only jobs specified by user -------------------------------
    {
      const ids = (argv.length > 0) ? argv : (await promptUserForJobId(runner, stack_paths, [], !this.settings.get('interactive')) || "")
      if(ids === "") return // exit if user selects empty
      var result = matchingJobInfo(runner, JSTools.arrayWrap(ids), stack_paths)
      if(result.success) job_info = result.data
      else return (flags.json) ? console.log("{}") : printResultState(result)
    }

    var data:Dictionary = {}
    job_info.map((info:Dictionary) => {
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
