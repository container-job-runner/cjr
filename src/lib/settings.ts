// ===========================================================================
// Settings: A class for getting and setting cli properties
// Lazy loading & static data object
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import {JSONFile} from './fileio/json-file'
import {ValidatedOutput} from './validated-output'
import {cli_settings_yml_name, defaultCLISettings} from './constants'

export class Settings
{

  private config_name: string = cli_settings_yml_name;
  private cli_name: string
  private static settings: object = undefined
  private JSON_file: JSONFile
  private defaults: object = {}

  private ERRORSTRS = {
    "InvalidField" : "Invalid Settings Property"
  }

  constructor(settings_dir: string, cli_name:string = "cli")
  {
    this.defaults = defaultCLISettings(settings_dir)
    this.JSON_file = new JSONFile(settings_dir, true)
    this.cli_name = cli_name;
  }

  set(field: string, value: any)
  {
    if(this.settings === undefined) this.load();
    if(Object.keys(this.defaults).includes(field) == false)
      return new ValidatedOutput(false, [], [this.ERRORSTRS["InvalidField"]]);
    this.settings[field] = value
    return this.JSON_file.write(this.config_name, this.settings)
  }

  get(field: string)
  {
    if(this.settings === undefined) this.load();
    return this.settings[field]
  }

  private load()
  {
    var result = this.JSON_file.read(this.config_name)
    this.settings = (result.success) ? result.data : this.defaults
  }

}
