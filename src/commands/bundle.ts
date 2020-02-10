import * as chalk from 'chalk'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as inquirer from 'inquirer'
import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../lib/commands/stack-command'
import {IfBuiltAndLoaded} from '../lib/functions/run-functions'
import {cli_bundle_dir_name, project_settings_folder, project_settings_file, projectSettingsYMLPath} from '../lib/constants'
import {printResultState} from '../lib/functions/misc-functions'
import {ShellCommand} from '../lib/shell-command'
import {FileTools} from '../lib/fileio/file-tools'
import {YMLFile} from '../lib/fileio/yml-file'

export default class Bundle extends StackCommand {
  static description = 'bundle a stack and its project files for sharing.'
  static args = [{name: 'save_dir', required: true}]
  static flags = {
    stack: flags.string({env: 'STACK'}),
    hostRoot: flags.string({env: 'HOSTROOT'}),
    configFiles: flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    explicit: flags.boolean({default: false}),
    all: flags.boolean({default: false, description: 'include project files in bundle'}),
    zip: flags.boolean({default: false, exclusive: ['tar'], description: 'produces one .zip file (requires gzip)'}),
    tar:  flags.boolean({default: false, exclusive: ['zip'], description: 'produces one .tar.gz file (requires zip)'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"})
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parseWithLoad(Bundle, {stack:true, configFiles: false, hostRoot:false})
    const builder    = this.newBuilder(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    var result = IfBuiltAndLoaded(builder, "no-rebuild", {hostRoot: flags?.hostRoot}, stack_path, flags.configFiles,
      (configuration, containerRoot, hostRoot) => {
        var result = configuration.bundle(stack_path);
        printResultState(result); // print any warnings from bundle
        return result
      })

    if(!result.success) return; // exit if no configuration was loaded

    const configuration = result.data
    const copy_files    = flags.all && flags.hostRoot // if true, then project files are included in bundle
    // -- select and create temporary directory --------------------------------
    const stack_name = builder.stackName(stack_path)
    result = FileTools.mktempDir(path.join(this.config.dataDir, cli_bundle_dir_name)) // tmp directory that stores bundle - extra protection to prevent entry from ever being blank.
    if(!result.success) return printResultState(result)
    const temp_dir = result.data
    const bundle_path = (flags.hostRoot) ? path.join(temp_dir, path.basename(flags.hostRoot)) : temp_dir

    // -- get filenames and paths ----------------------------------------------
    const settings_dir      = path.join(bundle_path, project_settings_folder)  // directory that stores project settings yml & stack
    const new_stack_path    = path.join(settings_dir, stack_name)                // location of copied stack
    const settings_yml_path = projectSettingsYMLPath(bundle_path)              // location of settings yml

    // -- copy project files to bundle (remove any existing settings directory)
    if(copy_files) {
      fs.copySync(flags.hostRoot, bundle_path)
      fs.removeSync(settings_dir)
    }

    // -- copy stack to bundle -------------------------------------------------
    result = builder.copy(stack_path, new_stack_path, configuration)
    if(!result.success) return printResultState(result);

    // -- write project settings file ------------------------------------------
    const writer = new YMLFile(settings_dir, true);
    result = writer.write(project_settings_file, {stack: `./${stack_name}`})
    if(!result.success) return printResultState(result);

    // -- copy bundle to user specified location -------------------------------
    const bundle_src_path = (copy_files) ? bundle_path : settings_dir         // root folder for bundle
    const bundle_dest_path = this.bundleDestPath(flags, argv, copy_files)       // final location for user

    // -- save bundle files ----------------------------------------------------
    const overwrite = await this.allowOverwrite(bundle_dest_path, this.settings.get('interactive'))
    if(overwrite && flags.tar) {
      this.tar(bundle_src_path, bundle_dest_path, flags.explicit)
    } else if(overwrite && flags.zip) {
      this.zip(bundle_src_path, bundle_dest_path, flags.explicit)
    } else if(overwrite) {
      fs.copySync(bundle_src_path, bundle_dest_path)
    }

    // -- remove temp_dir ------------------------------------------------------
    fs.removeSync(temp_dir)
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

  bundleDestPath(flags:Dictionary, argv:Array<string>, copy_files:boolean)
  {
    var bundle_name = (copy_files) ? path.basename(flags.hostRoot) : project_settings_folder
    if((flags.zip || flags.tar)) bundle_name = bundle_name.replace(/^\./, "")   // name of settings folder (remove . if creating zip file)
    if(flags.zip) bundle_name = `${bundle_name}.zip`
    if(flags.tar) bundle_name = `${bundle_name}.tar.gz`
    return path.join(process.cwd(), argv[0], bundle_name)
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
