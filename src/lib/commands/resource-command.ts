// ===========================================================================
// Remote Command: Abstract Class for commands that require resources
// ===========================================================================

//import Command from '@oclif/command'
import path = require('path')
import fs = require('fs-extra')
import constants = require('../constants')
import { PathTools } from '../fileio/path-tools'
import { ValidatedOutput } from '../validated-output'
import { ErrorStrings } from '../error-strings'
import { JobCommand } from './job-command'

export abstract class ResourceCommand extends JobCommand
{
    validResourceName(name: string) : ValidatedOutput<string>
    {
      if(!this.resource_configuration.isResource(name))
        return new ValidatedOutput(false, "").pushError(ErrorStrings.REMOTE_RESOURCE.NAME_NON_EXISTANT(name))
      return new ValidatedOutput(true, name)
    }

    // -- key functions --------------------------------------------------------

    copyKeyfile(key_path: string, id: number)
    {
      const name = `r${id}_${new Date().getTime()}`
      const keyfile_copy_path = path.join(this.localKeyDir(), name)
      fs.ensureDir(this.localKeyDir())
      fs.copyFileSync(path.resolve(key_path), keyfile_copy_path)
      fs.chmodSync(keyfile_copy_path, '600')
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
      return path.join(this.config.configDir, constants.subdirectories.config['remote-keys'])
    }

}
