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
import {StackCommand} from '../../commands/stack-command'

export type  Dictionary= {[key: string]: any}
type DriverCommands = "jobAttach" | "jobDelete" | "jobList" | "jobLog" | "jobStop"

export abstract class RemoteCommand extends StackCommand
{
    protected resource_config_file = new JSONFile(this.config.configDir, true, rc_vo_validator)

    remoteCommand(command: DriverCommands, flags:Dictionary, args:Dictionary, argv:Array<string>)
    {
      const resource_config = this.readResourceConfig()
      // -- validate id ----------------------------------------------------------
      var result = this.validResourceName(flags["remoteName"], resource_config)
      if(!result.success) return printResultState(result)
      const remote_name = result.data
      // -- modify resource and write file ---------------------------------------
      const resource = resource_config[remote_name]
      const driver = this.newRemoteDriver(resource["type"], flags.explicit, flags.silent, flags.verbose)
      printResultState(driver[command](resource, flags, args, argv))
    }

    validResourceName(name: string, resources: Dictionary)
    {
      if(!resources.hasOwnProperty(name))
        return new ValidatedOutput(false, [], [ErrorStrings.REMOTE_RESOURCE.NAME_NON_EXISTANT(name)])
      return new ValidatedOutput(true, name)
    }

    newRemoteDriver(remote_type: string, explicit: boolean, silent:boolean, verbose:boolean)
    {
      switch(remote_type)
      {
        case "cjr":
        {
          const ssh_shell = new SshShellCommand(explicit, silent, this.config.dataDir)
          return new CJRRemoteDriver(ssh_shell, verbose, silent, this.config);
        }
        default:
        {
          this.error("invalid remote type")
        }
      }
    }

    // -- Config file functions ------------------------------------------------

    writeResourceConfig(data: any)
    {
      return this.resource_config_file.validatedWrite(remote_config_filename, data)
    }

    readResourceConfig()
    {
      const result = this.resource_config_file.validatedRead(remote_config_filename)
      return (result.success) ? result.data : default_remote_config
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
}
