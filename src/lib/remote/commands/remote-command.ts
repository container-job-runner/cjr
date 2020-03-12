// ===========================================================================
// Remote Command: Abstract Class for all remote commands
// ===========================================================================

//import Command from '@oclif/command'
import * as path from 'path'
import * as fs from 'fs-extra'
import {JSONFile} from '../../fileio/json-file'
import {PathTools} from '../../fileio/path-tools'
import {rc_vo_validator} from '../config/resource-configuration-schema'
import {project_settings_folder} from '../../constants'
import {remote_config_filename, default_remote_config, remote_keys_dir_name} from '../constants'
import {ValidatedOutput} from '../../validated-output'
import {ErrorStrings} from '../error-strings'
import {CJRRemoteDriver} from '../drivers/cjr-remote-driver'
import {SshShellCommand} from '../ssh-shell-command'
import {printResultState} from '../../functions/misc-functions'
import {OutputOptions} from "../../functions/run-functions"
import {StackCommand} from '../../commands/stack-command'
import {ResourceConfiguration, Resource} from '../config/resource-configuration'

export type  Dictionary= {[key: string]: any}
type DriverCommands = "jobAttach" | "jobList" | "jobLog" | "jobStop" | "jobState"

var a = {}
a.b = 1

export abstract class RemoteCommand extends StackCommand
{
    protected resource_configuration = new ResourceConfiguration(this.config.configDir)

    remoteCommand(command: DriverCommands, flags:Dictionary, args:Dictionary, argv:Array<string>)
    {
      // -- validate id --------------------------------------------------------
      var result = this.validResourceName(flags["remote-name"])
      if(!result.success) return printResultState(result)
      const remote_name = result.data
      // -- modify resource and write file -------------------------------------
      const resource = this.resource_configuration.getResource(remote_name)
      if(resource !== undefined) {
        const driver = this.newRemoteDriver(resource["type"], {explicit: flags.explicit, verbose: flags.verbose, silent: flags.silent})
        printResultState(driver[command](resource, flags, args, argv))
      }
    }

    validResourceName(name: string)
    {
      if(!this.resource_configuration.isResource(name))
        return new ValidatedOutput(false, [], [ErrorStrings.REMOTE_RESOURCE.NAME_NON_EXISTANT(name)])
      return new ValidatedOutput(true, name)
    }

    newRemoteDriver(remote_type: string, output_options: OutputOptions, autodisconnect: boolean = true)
    {
      switch(remote_type)
      {
        case "cjr":
        {
          const ssh_shell = new SshShellCommand(output_options.explicit, output_options.silent, this.config.dataDir)
          return new CJRRemoteDriver(ssh_shell, output_options, this.config.dataDir, {autodisconnect: autodisconnect, autoconnect: true});
        }
        default:
        {
          this.error("invalid remote type")
        }
      }
    }

    // -- key functions --------------------------------------------------------

    copyKeyfile(key_path: string, id: number)
    {
      const name = `r${id}_${new Date().getTime()}`
      const keyfile_copy_path = path.join(this.localKeyDir(), name)
      fs.ensureDir(this.localKeyDir())
      fs.copyFileSync(path.resolve(key_path), keyfile_copy_path)
      return keyfile_copy_path
    }

    removeKeyfile(key_path: string)
    {
      const key_path_arr = PathTools.split(key_path)
      const keydir_arr = PathTools.split(this.localKeyDir())
      if(PathTools.ischild(keydir_arr, key_path_arr)) fs.unlink(key_path)
    }

    private localKeyDir()
    {
      return path.join(this.config.configDir, remote_keys_dir_name)
    }

    // -- quickness flag -------------------------------------------------------

    applyProtocolFlag(flags:Dictionary)
    {
      if(!flags['protocol']) return // missing
      if(!/\d{1,4}/.test(flags['protocol'] || "")) return // malformed
      // split protocl flag into digits ----------------------------------------
      const protocol_str = `${flags['protocol']}`
      const protocol_digits = protocol_str.split("").map((d:string) => Number(d))
      const [stack_upload, file_upload, build, file_access] = protocol_digits
      // -- stack-upload-mode --------------------------------------------------
      if(stack_upload === 0) flags['stack-upload-mode'] = "cached"
      else if(stack_upload === 1) flags['stack-upload-mode'] = "uncached"
      // -- file-upload-mode ---------------------------------------------------
      if(file_upload === 0) flags['file-upload-mode'] = "cached"
      else if(file_upload === 1) flags['file-upload-mode'] = "uncached"
      // -- build-mode ---------------------------------------------------------
      if(build === 0) flags['build-mode'] = "no-rebuild"
      else if(build === 1) flags['build-mode'] = "build"
      else if(build === 2) flags['build-mode'] = "build-nocache"
      // -- build-mode ---------------------------------------------------------
      if(file_access === 0) flags['file-access'] = "bind"
      else if(file_access === 1) flags['file-access'] = "volume"
    }
}
