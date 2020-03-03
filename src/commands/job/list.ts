import {flags} from '@oclif/command'
import {printVerticalTable, printHorizontalTable} from '../../lib/functions/misc-functions'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'

export default class List extends StackCommand {
  static description = 'List all running jobs, or all running jobs for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    json: flags.boolean({default: false}),
    verbose: flags.boolean({default: false}),
    all: flags.boolean({default: false, description: "if this flag is added then list shows jobs from all stacks, regardless of whether stack flag is set"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(List, {stack:false})
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (!flags.all && flags.stack) ? this.fullStackPath(flags.stack) : ""
    const jobs = runner.jobInfo(stack_path)


    if(flags.json) { // -- JSON format -----------------------------------------
      console.log(JSON.stringify(jobs))
      return
    }

    var table_parameters: Dictionary
    var toArray: (e: Dictionary) => Array<any>
    var printTable


    if(flags.verbose)  // -- Verbose Output ------------------------------------
    {
      table_parameters = {
          row_headers:    ["ID", "STACK", "COMMAND", "STATUS", "MESSAGE"],
          column_widths:  [9, 103],
          text_widths:    [8, 102],
          silent_clip:    [true, true]
      }
      toArray = (e:Dictionary) => [e.id, e.stack, e.command, e.statusString, e?.labels?.message || ""]
      printTable = printHorizontalTable
    }
    else // -- Standard Output -------------------------------------------------
    {
      table_parameters = {
          column_headers: ["ID", "STACK", "COMMAND", "STATUS"],
          column_widths:  [17, 20, 40, 35],
          text_widths:    [12, 15, 35, 30],
          silent_clip:    [true, false, false, false]
      }
      toArray = (e:Dictionary) => [e.id, e.stack, e.command, e.statusString]
      printTable = printVerticalTable
    }

    printTable({ ...table_parameters, ...{
        title:  "Running Jobs",
        data:   jobs.filter((j:Dictionary) => (j.status === "running")).map((e:Dictionary) => toArray(e))
    }})

    printTable({ ...table_parameters, ...{
        title:  "Completed Jobs",
        data:   jobs.filter((j:Dictionary) => (j.status === "exited" && j?.labels?.jobtype !== "stash")).map((e:Dictionary) => toArray(e)),
    }})

    printTable({ ...table_parameters, ...{
        title:  "Stashes",
        data:   jobs.filter((j:Dictionary) => (j?.labels?.jobtype === "stash")).map((e:Dictionary) => toArray(e)),
    }})



  }

}
