// ===========================================================================
// Settings: A class for getting and setting cli properties
// Lazy loading & static data object
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {JSONFileWriter} from './json-file-writer'
import {ValidatedOutput} from './validated-output'

export class Settings extends JSONFileWriter
{

  private config_name: string = "settings";
  private cli_name: string
  private static settings: object = undefined
  private ERRORSTRS = {
    "Invalid" : "Invalid Settings Property"
  }

  constructor(config_dir: string, cli_name:string = "cli")
  {
    super(config_dir)
    this.cli_name = cli_name;

    // load existing config file or create one
    if(!fs.existsSync(this.filePath(this.config_name)))
    {
      this.settings = this.defaultSettings()
      this.write()
      console.log("write")
    }

  }

  defaultSettings(auto:boolean = true)
  {
    let cmd = "podman"
    if(auto)
    {
      switch(os.platform())
      {
        case "darwin":
        case "win32":
          cmd = "docker"
          break
        default:
          cmd = "podman"
      }
    }

    return {
        stacks_path: path.join(this.parent_dir, "stacks"),
        build_cmd: cmd,
        run_cmd: cmd,
        image_tag: this.cli_name
    }
  }

  set(field: string, value: any)
  {
    if(this.settings === undefined) this.read();
    if(Object.keys(this.defaultSettings(false)).includes(field) == false)
      return new ValidatedOutput(false, [], [this.ERRORSTRS["Invalid"]]);
    this.settings[field] = value
    this.write()
    return new ValidatedOutput(true);
  }

  get(field: string)
  {
    if(this.settings === undefined) this.read();
    return this.settings[field]
  }

  read()
  {
    this.settings = super.read(this.config_name)
  }

  write()
  {
    super.write(this.config_name, this.settings)
  }

}
