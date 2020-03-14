import * as chalk from 'chalk'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as inquirer from 'inquirer'
import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../lib/commands/stack-command'
import {cli_bundle_dir_name, project_settings_folder, project_settings_file, projectSettingsYMLPath} from '../lib/constants'
import {printResultState} from '../lib/functions/misc-functions'
import {bundleStack, bundleProjectSettings, bundleProject, ContainerRuntime, ProjectBundleOptions} from '../lib/functions/run-functions'
import {ShellCommand} from '../lib/shell-command'
import {FileTools} from '../lib/fileio/file-tools'
import {YMLFile} from '../lib/fileio/yml-file'

export default class Bundle extends StackCommand {
  static description = 'bundle a stack and its project files for sharing.'
  static args = [{name: 'save_dir', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    verbose: flags.boolean({default: false}),
    zip: flags.boolean({default: false, exclusive: ['tar'], description: 'produces a zip output file (requires gzip)'}),
    tar:  flags.boolean({default: false, exclusive: ['zip'], description: 'produces a tar.gz output file (requires zip)'}),
    "include-files": flags.boolean({default: false, description: 'include project files in bundle'}),
    "include-stacks-dir": flags.boolean({default: false, description: 'include all stacks in stacks directory'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = true;

  async run()
  {
    const {args, flags} = this.parse(Bundle)
    this.augmentFlagsWithProjectSettings(flags, {stack:true, "config-files": false, "project-root":true, "stacks-dir": false})
    const stack_path = this.fullStackPath(flags.stack, flags["stacks-dir"])
    // -- set container runtime options ----------------------------------------
    const runtime_options:ContainerRuntime = {
      builder: this.newBuilder(flags.explicit, !flags.verbose),
      runner:  this.newRunner(flags.explicit, flags.silent)
    }
    // -- create tmp dir for bundle --------------------------------------------
    var result = FileTools.mktempDir(path.join(this.config.dataDir, cli_bundle_dir_name))
    if(!result.success) return printResultState(result)
    const tmp_dir = result.data
    // -- set copy options -----------------------------------------------------
    const options: ProjectBundleOptions = {
      "project-root": flags["project-root"],
      "stack-path":   stack_path,
      "config-files": flags["config-files"],
      "bundle-path":  (flags['include-files']) ? path.join(tmp_dir, path.basename(flags['project-root'])) : path.join(tmp_dir, project_settings_folder),
      "verbose":      flags.verbose
    }
    if(flags['include-stacks-dir']) options["stacks-dir"] = flags["stacks-dir"]

    if(flags['include-files']) // -- bundle all files --------------------------
      result = bundleProject(runtime_options, options)
    else // -- bundle project configuration ------------------------------------
      result = bundleProjectSettings(runtime_options, options)
    printResultState(result)

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
