import fs = require('fs-extra')
import path = require('path')
import inquirer = require('inquirer')
import constants = require('../lib/constants')

import { flags } from '@oclif/command'
import { BasicCommand } from '../lib/commands/basic-command'
import { Dictionary } from '../lib/constants'
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { bundleProjectSettings, bundleProject, ProjectBundleOptions } from '../lib/functions/cli-functions'
import { ShellCommand } from '../lib/shell-command'
import { FileTools } from '../lib/fileio/file-tools'
import { ValidatedOutput } from '../lib/validated-output'

export default class Bundle extends BasicCommand {
  static description = 'Bundle a stack or project into a zip or tar for sharing.'
  static args = [{name: 'save_dir', required: true}]
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false}),
    "zip": flags.boolean({default: false, exclusive: ['tar'], description: 'produces a zip output file (requires gzip)'}),
    "tar": flags.boolean({default: false, exclusive: ['zip'], description: 'produces a tar.gz output file (requires zip)'}),
    "include-files": flags.boolean({default: false, description: 'include project files in bundle'}),
    "include-stacks-dir": flags.boolean({default: false, description: 'include all stacks in stacks directory'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(Bundle)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":true, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack as string, flags["stacks-dir"] || "")
    // -- set container runtime options ----------------------------------------
    const job_manager = this.newJobManager('localhost', {verbose: flags.verbose, quiet: false, explicit: flags.explicit})
    // -- create tmp dir for bundle --------------------------------------------
    var result:ValidatedOutput<any> = FileTools.mktempDir(path.join(this.config.dataDir, constants.subdirectories.data.bundle))
    if(!result.success) return printValidatedOutput(result)
    const tmp_dir = result.value
    // -- set copy options -----------------------------------------------------
    const options: ProjectBundleOptions = {
      "project-root": (flags["project-root"] as string),
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "bundle-path":  (flags['include-files']) ? path.join(tmp_dir, path.basename(flags['project-root'] as string)) : path.join(tmp_dir, constants.project_settings.dirname),
      "verbose":      flags.verbose
    }
    if(flags['include-stacks-dir']) options["stacks-dir"] = flags["stacks-dir"]

    if(flags['include-files']) // -- bundle all files --------------------------
      result = bundleProject(job_manager.container_drivers, job_manager.configurations, options)
    else // -- bundle project configuration ------------------------------------
      result = bundleProjectSettings(job_manager.container_drivers, job_manager.configurations, options)
    printValidatedOutput(result)

    // -- copy bundle to user specified location -------------------------------
    const bundle_dest_path = this.bundleDestPath(flags, args.save_dir, path.basename(options["bundle-path"])) // final location for user
    const overwrite = await this.allowOverwrite(bundle_dest_path, this.settings.get('interactive'))
    if(overwrite && flags.tar)
      this.tar(options["bundle-path"], bundle_dest_path, flags.explicit)
    else if(overwrite && flags.zip)
      this.zip(options["bundle-path"], bundle_dest_path, flags.explicit)
    else if(overwrite)
      fs.copySync(options["bundle-path"], bundle_dest_path)
    // -- remove temp_dir ------------------------------------------------------
    fs.removeSync(tmp_dir)

  }

  async allowOverwrite(bundle_dest_path: string, interactive: boolean)
  {
    if(!interactive || !fs.existsSync(bundle_dest_path)) return true
    var response = await inquirer.prompt([
        {
            name: "overwrite",
            message: `overwrite existing "${bundle_dest_path}"?`,
            type: "confirm",
        }
      ])
    return response.overwrite
  }

  bundleDestPath(flags:Dictionary, save_dir:string, source_name: string)
  {
    if((flags.zip || flags.tar)) source_name = source_name.replace(/^\./, "")   // name of settings folder (remove . if creating zip or tar file)
    if(flags.zip) source_name = `${source_name}.zip`
    if(flags.tar) source_name = `${source_name}.tar.gz`
    return path.join(process.cwd(), save_dir, source_name)
  }

  zip(source_dir: string, destination: string, explicit:boolean)
  {
    const shell = new ShellCommand(explicit, false)
    const cmd_flags = {'r': {}, 'q': {}}
    const cmd_args  = [destination, path.basename(source_dir)]
    shell.exec('zip', cmd_flags, cmd_args, {cwd: path.dirname(source_dir)})
  }

  tar(source_dir: string, destination: string, explicit:boolean)
  {
    const shell = new ShellCommand(explicit, false)
    const cmd_flags = {'czf': {shorthand: true}}
    const cmd_args  = [destination, path.basename(source_dir)]
    shell.exec('tar', cmd_flags, cmd_args, {cwd: path.dirname(source_dir)})
  }

}
