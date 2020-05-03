import * as path from 'path'
import { flags} from '@oclif/command'
import { printVerticalTable, printHorizontalTable, printResultState } from '../../lib/functions/misc-functions'
import { StackCommand } from '../../lib/commands/stack-command'
import { Dictionary } from '../../lib/constants'

export default class List extends StackCommand {
  static description = 'List all running and completed jobs.'
  static args = []
  static flags = {
    "json": flags.boolean({default: false}),
    "all": flags.boolean({default: false, description: "if this flag is added then list shows jobs from all stacks, regardless of whether stack flag is set"}),
    "show-stashes": flags.boolean({default: false, description: "show stashes"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: "shows all job properties."})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false})
    const runner  = this.newRunner(flags.explicit)
    const stack_paths = (flags['all']) ? undefined : flags['visible-stacks']?.map((stack:string) => this.fullStackPath(stack, flags["stacks-dir"]))
    const job_info = runner.jobInfo({'stack-paths': stack_paths})
    if(!job_info.success) return printResultState(job_info)
    const jobs = job_info.value

    if(flags.json) { // -- JSON format -----------------------------------------
      console.log(JSON.stringify(jobs))
      return
    }

    var table_parameters: Dictionary;
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
      toArray = (e:Dictionary) => [e.id, e.stack, e.command, e.status, e?.labels?.message || ""]
      printTable = printHorizontalTable
    }
    else // -- Standard Output -------------------------------------------------
    {

      type TableFields = "id"|"stack"|"stackName"|"command"|"status"|"message";
      const field_params = {
        id: {
          "column_header":  "ID",
          "column_width":   17,
          "text_width":     12,
          "silent_clip":    true,
          "getter": (d:Dictionary) => d.id
        },
        stack: {
          "column_header":  "STACK",
          "column_width":   20,
          "text_width":     15,
          "silent_clip":    false,
          "getter": (d:Dictionary) => d.stack
        },
        stackName: {
          "column_header":  "STACKNAME",
          "column_width":   20,
          "text_width":     15,
          "silent_clip":    false,
          "getter": (d:Dictionary) => path.basename(d.stack)
        },
        command: {
          "column_header":  "COMMAND",
          "column_width":   40,
          "text_width":     35,
          "silent_clip":    false,
          "getter": (d:Dictionary) => d.command
        },
        status: {
          "column_header":  "STATUS",
          "column_width":   35,
          "text_width":     30,
          "silent_clip":    false,
          "getter": (d:Dictionary) => d.status
        },
        message: {
          "column_header":  "MESSAGE",
          "column_width":   40,
          "text_width":     35,
          "silent_clip":    false,
          "getter": (d:Dictionary) => (d?.labels?.message || "")
        }
      }

      const valid_fields = Object.keys(field_params);
      const user_fields:Array<TableFields> = (this.settings.get('job-ls-fields').split(/\s*,\s*/).filter((field:string) => valid_fields.includes(field)) as Array<TableFields>);

      table_parameters = {
        column_headers: [],
        column_widths:  [],
        text_widths:    [],
        silent_clip:    []
      }

      user_fields.map((field:TableFields) => {
        table_parameters.column_headers.push(field_params[field].column_header)
        table_parameters.column_widths.push(field_params[field].column_width)
        table_parameters.text_widths.push(field_params[field].text_width)
        table_parameters.silent_clip.push(field_params[field].silent_clip)
      })

      toArray = (e:Dictionary) => (user_fields.map((field:TableFields) => field_params[field].getter(e)))
      printTable = printVerticalTable
    }

    printTable({ ...table_parameters, ...{
        title:  "Running Jobs",
        data:   jobs.filter((j:Dictionary) => (j.state === "running")).map((e:Dictionary) => toArray(e))
    }})

    printTable({ ...table_parameters, ...{
        title:  "Completed Jobs",
        data:   jobs.filter((j:Dictionary) => (j.state === "exited" && j?.labels?.jobtype !== "stash")).map((e:Dictionary) => toArray(e)),
    }})

    if(flags['show-stashes'] || flags['all'])
      printTable({ ...table_parameters, ...{
          title:  "Stashes",
          data:   jobs.filter((j:Dictionary) => (j?.labels?.jobtype === "stash")).map((e:Dictionary) => toArray(e)),
      }})

  }

}
