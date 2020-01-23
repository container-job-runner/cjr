import * as chalk from 'chalk'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as inquirer from 'inquirer'
import {flags} from '@oclif/command'
import {JobCommand} from '../lib/commands/job-command'
import {IfBuiltAndLoaded} from '../lib/functions/run-functions'
import {cli_bundle_dir_name, project_settings_folder, project_settings_file, projectSettingsYMLPath} from '../lib/constants'
import {printResultState} from '../lib/functions/misc-functions'
import {ShellCMD} from '../lib/shellcmd'
import {FileTools} from '../lib/fileio/file-tools'
import {YMLFile} from '../lib/fileio/yml-file'

export default class Run extends JobCommand {
  static description = 'bundle current configuration and files.'
  static args = [{name: 'save_dir', required: true}]
  static flags = {
    explicit: flags.boolean({default: false}),
    stack: flags.string({env: 'STACK', default: false}),
    hostRoot: flags.string({env: 'HOSTROOT', default: false}),
    all: flags.boolean({default: false, description: 'include project files in bundle'}),
    zip: flags.boolean({default: false, exclusive: ['tar'], description: 'produces one .zip file (requires gzip)'}),
    tar:  flags.boolean({default: false, exclusive: ['zip'], description: 'produces one .tar.gz file (requires zip)'}),
  }
  static strict = false;

  async run()
  {
    const {argv, flags} = this.parse(Run, true)
    const builder    = this.newBuilder(flags.explicit)
    const stack_path = this.fullStackPath(flags.stack)

    var result = IfBuiltAndLoaded(builder, flags, stack_path, this.project_settings.configFiles,
      (configuration, containerRoot, hostRoot) => {
        var result = configuration.bundle(stack_path);
        printResultState(result); // print any warnings from bundle
        return result
      })

    if(!result.success) return; // exit if no configutaion was loaded

    const configuration = result.data
    const copy_files    = flags.all && flags.hostRoot // if true, then project files are included in bundle
    // -- select and create temporary directory --------------------------------
    const stack_name        = builder.stackName(stack_path)
    const temp_dir_path     = path.join(this.config.dataDir, cli_bundle_dir_name, stack_name) // tmp directory that stores bundle
    fs.ensureDirSync(temp_dir_path)
    // -- get filenames and paths ----------------------------------------------
    const settings_dir      = path.join(temp_dir_path, project_settings_folder)  // directory that stores project settings yml & stack
    const new_stack_path    = path.join(settings_dir, stack_name)                // location of copied stack
    const settings_yml_path = projectSettingsYMLPath(temp_dir_path)              // location of settings yml

    // -- copy project files to bundle (remove any existing settings directory)
    if(copy_files) {
      fs.copySync(flags.hostRoot, temp_dir_path)
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
    const bundle_src_path = (copy_files) ? temp_dir_path : settings_dir         // root folder for bundle
    const bundle_dest_path = this.bundleDestPath(flags, argv, copy_files)       // final location for user

    // -- save bundle files ----------------------------------------------------
    const overwrite = await this.allowOverwrite(bundle_dest_path, this.settings.get('interactive'))
    if(overwrite && flags.tar) {
      this.tar(bundle_src_path, bundle_dest_path)
    } else if(overwrite && flags.zip) {
      this.zip(bundle_src_path, bundle_dest_path)
    } else if(overwrite) {
      fs.copySync(bundle_src_path, bundle_dest_path)
    }

    // -- remove temp_dir ------------------------------------------------------
    fs.removeSync(temp_dir_path)
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

  bundleDestPath(flags, argv, copy_files)
  {
    var bundle_name = (copy_files) ? path.basename(flags.hostRoot) : project_settings_folder
    if((flags.zip || flags.tar)) bundle_name = bundle_name.replace(/^\./, "")   // name of settings folder (remove . if creating zip file)
    if(flags.zip) bundle_name = `${bundle_name}.zip`
    if(flags.tar) bundle_name = `${bundle_name}.tar.gz`
    return path.join(process.cwd(), argv[0], bundle_name)
  }

  zip(source_dir, destination)
  {
    const shell = new ShellCMD(flags.explicit)
    const cmd_flags = {'r': {shorthand: true}, 'q': {shorthand: true}}
    const cmd_args  = [destination, path.basename(source_dir)]
    shell.sync('zip', cmd_flags, cmd_args, {cwd: path.dirname(source_dir)})
  }

  tar(source_dir, destination)
  {
    const shell = new ShellCMD(flags.explicit)
    const cmd_flags = {'czf': {shorthand: true}}
    const cmd_args  = [destination, path.basename(source_dir)]
    shell.sync('tar', cmd_flags, cmd_args, {cwd: path.dirname(source_dir)})
  }

}
