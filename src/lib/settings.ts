// ===========================================================================
// Settings: A class for getting and setting cli properties
// Lazy loading & static data object
// ===========================================================================

import { JSONFile } from './fileio/json-file'
import { ValidatedOutput } from './validated-output'
import { cli_settings_yml_name, defaultCLISettings } from './constants'
import { ErrorStrings } from './error-strings'
import { JSTools } from './js-tools'

export class Settings
{

  private config_name: string = cli_settings_yml_name;
  private static raw_data: {[key: string]: any}|undefined = undefined
  private JSON_file: JSONFile
  private defaults: object = {}

  constructor(config_dir: string, data_dir:string, cache_dir: string)
  {
    this.defaults = defaultCLISettings(config_dir, data_dir, cache_dir)
    this.JSON_file = new JSONFile(config_dir, true)
  }

  set(field: string, value: any)
  {
    if(Settings.raw_data === undefined) this.load();
    if(Object.keys(this.defaults).includes(field) == false)
      return new ValidatedOutput(false, [], [ErrorStrings.CLI_SETTINGS.INVALID_FIELD(field)]);
    // automatically convert strings "true" and "false" too booleans
    if(value === "true") value = true
    else if (value == "false") value = false
    if(Settings?.raw_data) Settings.raw_data[field] = value
    return this.JSON_file.write(this.config_name, Settings.raw_data)
  }

  get(field: string)
  {
    if(Settings.raw_data === undefined) this.load();
    return Settings?.raw_data?.[field]
  }

  getRawData()
  {
    if(Settings.raw_data === undefined) this.load();
    return JSTools.rCopy(Settings?.raw_data || {})
  }

  private load()
  {
    const result = this.JSON_file.read(this.config_name)
    Settings.raw_data = (result.success) ? {...this.defaults, ...result.value} : this.defaults
  }

}
