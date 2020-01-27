import {flags} from '@oclif/command'
import {printTable} from '../../lib/functions/run-functions'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'

export default class List extends StackCommand {
  static description = 'List all running jobs for a stack.'
  static args = []
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    explicit: flags.boolean({default: false}),
    json: flags.boolean({default: false}),
    all: flags.boolean({default: false}) //if true shows jobs from all cjr stacks, regardless of whether stack is set
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(List, false)
    const runner  = this.newRunner(flags.explicit)
    const stack_path = (!flags.all && flags.stack) ? this.fullStackPath(flags.stack) : ""
    const jobs = runner.jobInfo(stack_path)


    const table_parameters = {
        column_headers: ["ID", "STACK", "COMMAND", "STATUS"],
        column_widths: [17, 20, 40, 35],
        text_widths: [12, 15, 35, 30],
        silent_clip: [true, false, false, false]
    }

    const toArray = (e:Dictionary) => [e.id, e.stack, e.command, e.statusString]

    printTable({ ...table_parameters, ...{
        title:  "Running Jobs",
        data:   jobs.filter((j:Dictionary) => (j.status === "running")).map((e:Dictionary) => toArray(e))
    }})

    printTable({ ...table_parameters, ...{
        title:  "Completed Jobs",
        data:   jobs.filter((j:Dictionary) => (j.status === "exited")).map((e:Dictionary) => toArray(e)),
    }})
  }

}
