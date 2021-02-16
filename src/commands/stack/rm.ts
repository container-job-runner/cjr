import { flags } from '@oclif/command'
import chalk = require('chalk')
import path = require('path')
import fs = require('fs-extra')
import inquirer = require('inquirer')
import { JobCommand } from '../../lib/commands/job-command'
import { FileTools } from '../../lib/fileio/file-tools'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { ValidatedOutput } from '../../lib/validated-output'
import { PathTools } from '../../lib/fileio/path-tools'

export default class Build extends JobCommand {
  static description = 'Permanently remove a stack directory.'
  static args = [{name: 'stack'}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "stack": flags.string({env: 'CJR_STACK'}),
    "debug": flags.boolean({default: false}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "quiet": flags.boolean({default: false, char: 'q'})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(Build)
    if ( args?.stack ) flags["stack"] = args['stack']
    this.augmentFlagsWithProjectSettings(flags, {"stack": true, "stacks-dir": true})
    
    const stacks_dir = flags["stacks-dir"] || this.settings.get("stacks-dir")
    const full_stack_path = path.resolve(path.join(stacks_dir, flags["stack"] || "invalid"))
    
    // Check 1 : ensure stack path is an existing directory
    if( ! FileTools.existsDir(full_stack_path) )
        return printValidatedOutput(
            new ValidatedOutput(false, undefined)
            .pushError(chalk`{bold Unable to remove stack}: The stack directory {green ${full_stack_path}} does not exist.`)
        )

    // Check 2: ensure that stack path is inside of stacks directory
    if ( ! PathTools.ischild( PathTools.split(stacks_dir), PathTools.split(full_stack_path), true))
        return printValidatedOutput(
            new ValidatedOutput(false, undefined)
            .pushError(chalk`{bold Unable to remove stack}: The stack directory {green ${full_stack_path}} is not a child of the stack directory {green ${stacks_dir}}.`)
        )

    // Check 3: ensure user confirms ( unless quiet flag is enabled )
    const confirm_remove = flags["quiet"] || (await inquirer.prompt([
      {
        name: "accept",
        message: chalk`Are you sure you want to remove the stack {green ${full_stack_path}}?`,
        type: "confirm",
        default: false
      }
    ])).accept;

    if ( confirm_remove )
        fs.removeSync(full_stack_path)

  }

}
