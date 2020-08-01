import constants = require('../../lib/constants')
import { flags} from '@oclif/command'
import { printVerticalTable, printHorizontalTable, printValidatedOutput } from '../../lib/functions/misc-functions'
import { BasicCommand } from '../../lib/commands/basic-command'
import { Dictionary, label_strings } from '../../lib/constants'
import { JobInfo } from '../../lib/drivers-containers/abstract/run-driver'

export default class List extends BasicCommand {
  static description = 'List all running and completed jobs.'
  static args = []
  static flags = {
    "resource": flags.string({env: 'RESOURCE'}),
    "json": flags.boolean({default: false}),
    "all": flags.boolean({default: false, description: "if this flag is added then list shows jobs from all stacks, regardless of whether stack flag is set"}),
    "running": flags.boolean({default: false, exclusive: ['excited']}),
    "exited": flags.boolean({default: false, exclusive: ['running']}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "visible-stacks": flags.string({multiple: true, description: "if specified only these stacks will be affected by this command"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: "shows all job properties."})
  }
  static strict = true;

  async run()
  {
    const { flags } = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"visible-stacks":false, "stacks-dir": false, "resource": false})
    const job_manager  = this.newJobManager(
        flags['resource'] || 'localhost',
        {
            verbose: flags['verbose'],
            quiet: false,
            explicit: flags['explicit']
        }
    )
    const job_info = job_manager.list({filter: {
      'stack-paths': (flags['all']) ? undefined : this.extractVisibleStacks(flags),
      'states': this.extractStateFromFlags(flags)
    }})
    if(!job_info.success) return printValidatedOutput(job_info)
    const jobs = job_info.value

    if(flags.json) { // -- JSON format -----------------------------------------
      console.log(JSON.stringify(jobs))
      return
    }

    let table_parameters: Dictionary;
    let resource_table_parameters: Dictionary
    let toArray: (e: JobInfo) => Array<string>
    let printTable

    const lbl_stack_name  = constants.label_strings['job']['stack-name']
    const lbl_message = constants.label_strings['job']['message']
    const lbl_command = constants.label_strings['job']['command']
    const getLabel = (job:JobInfo, label: string) => job?.labels?.[label] || ""

    if(flags.verbose)  // -- Verbose Output ------------------------------------
    {
      table_parameters = {
          row_headers:    ["ID", "IMAGE", "STACK", "STACKNAME", "COMMAND", "STATUS", "MESSAGE"],
          column_widths:  [11, 103],
          text_widths:    [10, 102],
          silent_clip:    [true, true]
      }
      resource_table_parameters = {
        row_headers:    ['RESOURCE', 'ADDRESS'],
        column_widths:  [11, 103],
        text_widths:    [10, 102],
        silent_clip:    [false]
      }

      toArray = (j:JobInfo) => [j.id, j.image, j.stack, getLabel(j, lbl_stack_name), getLabel(j, lbl_command), j.status, getLabel(j, lbl_message)]
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
          "getter": (j:JobInfo) => j.id
        },
        stack: {
          "column_header":  "STACK",
          "column_width":   20,
          "text_width":     15,
          "silent_clip":    false,
          "getter": (j:JobInfo) => j.stack
        },
        stackName: {
          "column_header":  "STACKNAME",
          "column_width":   20,
          "text_width":     15,
          "silent_clip":    false,
          "getter": (j:JobInfo) => getLabel(j, lbl_stack_name)
        },
        command: {
          "column_header":  "COMMAND",
          "column_width":   40,
          "text_width":     35,
          "silent_clip":    false,
          "getter": (j:JobInfo) => getLabel(j, lbl_command)
        },
        status: {
          "column_header":  "STATUS",
          "column_width":   35,
          "text_width":     30,
          "silent_clip":    false,
          "getter": (j:JobInfo) => j.status
        },
        message: {
          "column_header":  "MESSAGE",
          "column_width":   40,
          "text_width":     35,
          "silent_clip":    false,
          "getter": (j:JobInfo) => getLabel(j, lbl_message)
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

      toArray = (j:JobInfo) => (user_fields.map((field:TableFields) => field_params[field].getter(j)))
      printTable = printVerticalTable

      resource_table_parameters = {
        column_widths:  [17, 95],
        text_widths:    [12, 95],
        silent_clip:    [false, false]
      }

    }

    const resource_data = [
        flags['resource'] || 'localhost',
        `(${this.resource_configuration.getResource(flags['resource'] || "")?.address || '127.0.0.1'})`
    ]

    printTable({ ... resource_table_parameters, ... {
        title:  "Resource",
        data:   [resource_data]
    }})

    if(!flags['exited'])
        printTable({ ... table_parameters, ... {
            title:  "Running Jobs",
            data:   jobs.filter((j:JobInfo) => (j.state === "running")).map((j:JobInfo) => toArray(j))
        }})

    if(!flags['running'])
        printTable({ ... table_parameters, ... {
            title:  "Exited Jobs",
            data:   jobs.filter((j:JobInfo) => (j.state === "exited")).map((j:JobInfo) => toArray(j)),
        }})

  }

  extractStateFromFlags(flags: Dictionary) : undefined|["exited"]|["running"]
  {
    if(flags["running"]) return ["running"]
    if(flags["exited"]) return ["exited"]
    return undefined
  }

}
