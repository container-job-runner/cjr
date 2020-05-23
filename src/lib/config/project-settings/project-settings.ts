import fs = require('fs')
import path = require('path')
import { JSTools } from '../../js-tools'
import { YMLFile } from '../../fileio/yml-file'
import { ValidatedOutput } from '../../validated-output'
import { WarningStrings } from '../../error-strings'
import { ps_vo_validator } from './project-settings-schema'

export type StackSpecificConfiguration = {
  "stacks": Array<string>
  "path": string
}

export type ps_props = {
  "project-root"?: string,
  "stack"?: string,
  "config-files"?: Array<string>,
  "stacks-dir"?: string,
  "remote-name"?: string,
  "visible-stacks"?: Array<string>
  "stack-specific-config-files"?: Array<StackSpecificConfiguration>
}

export type ps_prop_keys = keyof ps_props

export class ProjectSettings
{
  private yml_file = new YMLFile("", false, ps_vo_validator)
  private raw_object: ps_props = {}
  private file_path: string = "" // location of last load

  constructor(file_path?: string)
  {
    if(file_path) this.loadFromFile(file_path)
  }

  // == Getter Methods =========================================================

  getProjectRoot() : string | undefined
  {
    return this.raw_object["project-root"]
  }

  getStack() : string | undefined
  {
    return this.raw_object["stack"]
  }

  getStackDir() : string | undefined
  {
    return this.raw_object["stacks-dir"]
  }

  getConfigFiles() : Array<string>|undefined
  {
    return this.raw_object["config-files"]
  }

  getRemoteName() : string | undefined
  {
    return this.raw_object["remote-name"]
  }

  getVisibleStacks() : Array<string> | undefined
  {
    return this.raw_object["visible-stacks"]
  }

  getStackSpecificConfigFiles() : Array<StackSpecificConfiguration> | undefined
  {
    return this.raw_object?.["stack-specific-config-files"]
  }

  // == Setter Methods =========================================================

  setProjectRoot(project_root: string)
  {
    this.raw_object["project-root"] = project_root
  }

  setStack(stack: string)
  {
    this.raw_object["stack"] = stack
  }

  setStacksDir(stacks_dir: string)
  {
    this.raw_object["stacks-dir"] = stacks_dir
  }

  setRemoteName(remote_name: string)
  {
    this.raw_object["remote-name"] = remote_name
  }

  setVisibleStacks(visible_stacks: Array<string>)
  {
    this.raw_object["visible-stacks"] = visible_stacks
  }

  setConfigFiles(config_files: Array<string>)
  {
    this.raw_object["config-files"] = config_files
  }

  addVisibleStacks(stacks: Array<string>)
  {
    if(this.raw_object["visible-stacks"] === undefined)
      this.raw_object["visible-stacks"] = []
    const vstacks = this.raw_object["visible-stacks"]
    vstacks.push( ... stacks.filter( (s:string) => !vstacks.includes(s)) )
  }

  addConfigFile(abs_path: string)
  {
    if(!this.raw_object["config-files"])
      this.raw_object["config-files"] = []
    this.raw_object["config-files"]?.push(abs_path)
    return true
  }

  addStackSpecificConfigFile(config_file: string, stacks: Array<string>)
  {
    if(this.raw_object["stack-specific-config-files"] === undefined)
      this.raw_object["stack-specific-config-files"] = []

    const sscfs = this.raw_object["stack-specific-config-files"]
    const sscf = sscfs.filter(
      (c: StackSpecificConfiguration) => c["path"] == config_file
    )
    if( sscf && sscf.length > 0 ) { // append to existing configuration
      const config_stacks = sscf[0].stacks
      config_stacks.push( ... stacks.filter( (s:string) => !config_stacks.includes(s)) )
    }
    else
      sscfs.push({
        "path": config_file,
        "stacks": stacks
      })
  }

  removeConfigFile(abs_path: string)
  {
    this.raw_object["config-files"] = this.raw_object["config-files"]?.filter( (s: string) => s !== abs_path )
  }

  removeVisibleStacks(stacks: Array<string>)
  {
    this.raw_object["visible-stacks"] = this.raw_object["visible-stacks"]?.filter( (s: string) => !stacks.includes(s) )
  }

  removeStackSpecificConfigFile(config_file: string, stacks?: Array<string>)
  {

    if(stacks === undefined)
      this.raw_object["stack-specific-config-files"] =
        this.raw_object["stack-specific-config-files"]?.filter(
          (s: StackSpecificConfiguration) => !(config_file == s.path)
        )
    else {
      // remove stacks
      this.raw_object["stack-specific-config-files"]?.map(
        (ssc:StackSpecificConfiguration) => {
          if(ssc.path == config_file)
            ssc.stacks = ssc.stacks.filter((s:string) => !stacks.includes(s))
      })
      // remove configurations with no stacks
      this.raw_object["stack-specific-config-files"] =
        this.raw_object["stack-specific-config-files"]?.filter(
            (s: StackSpecificConfiguration) => (s.stacks.length != 0)
        )
    }
  }

  get(props?:Array<keyof ps_props>) : ps_props
  {
    if(props !== undefined)
      return JSTools.oSubset(this.raw_object, props)
    return JSTools.rCopy(this.raw_object)
  }

  remove(prop: keyof ps_props)
  {
    delete this.raw_object[prop]
  }

  processedConfigFiles(stack: string) : ValidatedOutput<Array<string>>
  {
    stack = stack || this.raw_object.stack || ""
    const configs: Array<string> = []
    configs.push( ... this.raw_object["config-files"] || [])

    if(stack)
    {
      const ssconf = this.raw_object?.["stack-specific-config-files"]
      ssconf?.filter( (c: StackSpecificConfiguration) =>
        c.stacks.some(
          (s:string) => new RegExp(`(^${s}|\\${path.sep}${s})$`).test(stack)
        )
      ).map( (c: StackSpecificConfiguration) => configs.push( c["path"]) )
    }

    return this.configFilesToAbsPath(configs)
  }

  // ---------------------------------------------------------------------------
  // LOADPROJECTSETTINGS: loads any project settings from the cjr dir in hostRoot
  // -- Parameters -------------------------------------------------------------
  // file_path: string - absolute path to project-settings file
  // -- Returns ----------------------------------------------------------------
  // ValidatedOutput - lists any errors during load
  // ---------------------------------------------------------------------------
  loadFromFile(file_path: string) : ValidatedOutput<undefined>
  {
    // -- exit if no hostRoot is specified -------------------------------------
    if(!file_path) return new ValidatedOutput(true, undefined);
    // -- exit if no settings file exists --------------------------------------
    if(!fs.existsSync(file_path)) return new ValidatedOutput(false, undefined);
    // -- exit if settings file is invalid -------------------------------------
    const read_result = this.yml_file.validatedRead(file_path)
    if(read_result.success == false) {
      return new ValidatedOutput(false, undefined).pushWarning(
        WarningStrings.PROJECTSETTINGS.INVALID_YML(file_path)
      )
    }

    //  -- set project settings variable -----------------------------------------
    const project_settings:ps_props = read_result.value || {}
    this.stackToAbsPath(project_settings, file_path)
    const result = this.stacksDirToAbsPath(project_settings, file_path)
    this.raw_object = project_settings
    this.file_path = file_path
    return result
  }

  // -----------------------------------------------------------------------------
  // WRITETOFILE: writes current settings into a yml file
  // -- Parameters ---------------------------------------------------------------
  // file_path: string - absolute path to project-settings file
  // -- Returns ------------------------------------------------------------------
  // ValidatedOutput
  // -----------------------------------------------------------------------------
  writeToFile(file_path: string)
  {
    return this.yml_file.write(file_path, this.raw_object)
  }

  // -- HELPER: ensures project-settings stack path is absolute --------------------------
  private stackToAbsPath(props: ps_props, file_path: string)
  {
    if(props?.stack)
      props.stack = this.pathsToExistingAbs([props.stack], path.dirname(file_path)).pop() || props.stack
  }

  // -- HELPER: ensures overwriting project-config files exist and have absolute paths ---
  private configFilesToAbsPath(config_files: Array<string>) : ValidatedOutput<Array<string>>
  {
    const result = new ValidatedOutput(true, config_files)
    // conver config files to absolue
    config_files = this.pathsToExistingAbs(
      config_files,
      path.dirname(this.file_path),
      (path_str:string) => {
        result.pushWarning(WarningStrings.PROJECTSETTINGS.MISSING_CONFIG_FILE(this.file_path, path_str))
      }
    )
    return result
  }

  // -- HELPER: ensures project-settings stacks-dir is absolute ----------------
  private stacksDirToAbsPath(props: ps_props, file_path: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    if(!props?.["stacks-dir"]) return result

    const stacks_dir_ar = this.pathsToExistingAbs(
        [props["stacks-dir"]],
        path.dirname(file_path),
        (path_str:string) => {
          result.pushWarning(WarningStrings.PROJECTSETTINGS.MISSING_STACKS_PATH(file_path, path_str))
        }
      )
    if(stacks_dir_ar.length > 0) props["stacks-dir"] = stacks_dir_ar.pop()
    else delete props["stacks-dir"]
    return result
  }

  // ---------------------------------------------------------------------------
  // PATHTOEXISTINGABS: accepts array of relative or absolute paths and returns
  // array containing existing absolute paths.
  // -- Parameters -------------------------------------------------------------
  // paths: Array<string> - array of relative or absolute paths
  // parent_abs_path: string - parent directory of relative paths
  // onFail: (path:string):void - is called for each non existant path
  // -- Returns ----------------------------------------------------------------
  // Array<string> - absolute paths of existing files or directories.
  // ---------------------------------------------------------------------------
  private pathsToExistingAbs(paths:Array<string>, parent_abs_path: string, onFail:(path:string) => void = () => {})
  {
    return paths.map(
        (p:string) => (path.isAbsolute(p)) ? p : path.join(parent_abs_path, p)
      ).filter((p:string) => {
        let exists = fs.existsSync(p)
        if(!exists) onFail(p)
        return exists
      })
  }

}
