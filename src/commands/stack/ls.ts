import * as fs from 'fs-extra'
import * as path from 'path'
import * as chalk from 'chalk'
import {flags} from '@oclif/command'
import {FileTools} from '../../lib/fileio/file-tools'
import {StackCommand} from '../../lib/commands/stack-command'

export default class List extends StackCommand {
  static description = 'List all stacks present in the stacks path.'
  static args = []
  static flags = {
    "stacks-dir": flags.string({default: "", description: "override default stack directory"})
  }
  static strict = true;

  async run()
  {
    const {argv, flags} = this.parse(List)
    this.augmentFlagsWithProjectSettings(flags, {"stacks-dir": false})
    const stacks_path = flags["stacks-dir"] || this.settings.get("stacks_dir")
    fs.ensureDirSync(stacks_path)
    console.log(chalk`{bold PATH}    ${stacks_path}`)
    process.stdout.write(chalk`{bold STACKS}  `)
    fs.readdirSync(stacks_path)
      .filter((file_name: string) => !/^\./.test(path.basename(file_name)) && FileTools.existsDir(path.join(stacks_path, file_name)))
      .map((file_name:string, i:number) => console.log(`${(i == 0) ? "" : "        "}${file_name}`))
  }

}
