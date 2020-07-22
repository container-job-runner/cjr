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
  "stacks-dir"?: string,
  "resource"?: string,
  "visible-stacks"?: Array<string>
  "default-profiles"?: { [key: string] : Array<string> }
}

export type ps_prop_keys = keyof ps_props

export class ProjectSettings
{
  private yml_file = new YMLFile("", false, ps_vo_validator)
  private raw_object: ps_props = {}
  private file_path: string = "" // location of last load
  readonly profile_all_stacks_keyword = "ALL"

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

  getResource() : string | undefined
  {
    return this.raw_object["resource"]
  }

  getVisibleStacks() : Array<string> | undefined
  {
    return this.raw_object["visible-stacks"]
  }

  getDefaultProfiles() : {[key:string] : string[]} | undefined
  {
    return this.raw_object["default-profiles"]
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

  setResource(resource: string)
  {
    this.raw_object["resource"] = resource
  }

  setVisibleStacks(visible_stacks: Array<string>)
  {
    this.raw_object["visible-stacks"] = visible_stacks
  }

  setDefaultProfiles(default_profiles: { [key: string] : Array<string> })
  {
    this.raw_object["default-profiles"] = default_profiles
  }

  addVisibleStacks(stacks: Array<string>)
  {
    if(this.raw_object["visible-stacks"] === undefined)
      this.raw_object["visible-stacks"] = []
    const vstacks = this.raw_object["visible-stacks"]
    vstacks.push( ... stacks.filter( (s:string) => !vstacks.includes(s)) )
  }

  addDefaultProfile(profile: string, stacks?: Array<string>)
  {
    // -- add to new profile ---------------------------------------------------
    if(this.raw_object["default-profiles"] === undefined)
      this.raw_object["default-profiles"] = {}

    const default_profiles = this.raw_object["default-profiles"]
    if(default_profiles[profile] == undefined)
      default_profiles[profile] = [];

    stacks = stacks || [this.profile_all_stacks_keyword]
    default_profiles[profile] = JSTools.distinct(
      default_profiles[profile].concat(stacks)
    )
  }

  removeVisibleStacks(stacks: Array<string>)
  {
    this.raw_object["visible-stacks"] = this.raw_object["visible-stacks"]?.filter( (s: string) => !stacks.includes(s) )
  }

  removeDefaultProfile(profile: string, stacks?: Array<string>)
  {
    const default_profiles = this.raw_object["default-profiles"] || {}

    if(default_profiles[profile] && stacks !== undefined)
      default_profiles[profile] = default_profiles[profile]?.filter(
        (p_stack:string) => !stacks.includes(p_stack)
      )
    else
      delete default_profiles[profile]
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

  getActiveProfiles(stack: string) : Array<string>
  {
    const default_profiles = this.raw_object["default-profiles"]
    const patternsMatchHostStack = (accumulator: boolean, pattern: string) => accumulator || (new RegExp(`${pattern}$`).test(stack))

    if(stack && default_profiles !== undefined)
    {
      const profile_names = Object.keys(default_profiles)
      return profile_names.filter(
        (p_name:string) => default_profiles?.[p_name]?.includes(this.profile_all_stacks_keyword) ||
          default_profiles?.[p_name]?.reduce(patternsMatchHostStack, false) ||
          false
      )
    }
    return []
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
    const result = new ValidatedOutput(true, undefined)

    // -- exit if no hostRoot is specified -------------------------------------
    if(!file_path) return new ValidatedOutput(true, undefined);
    // -- exit if no settings file exists --------------------------------------
    if(!fs.existsSync(file_path)) return new ValidatedOutput(false, undefined);
    // -- exit if settings file is invalid -------------------------------------
    const read_result = this.yml_file.validatedRead(file_path)
    if(read_result.success == false) {
      return result.absorb(read_result).pushWarning(
        WarningStrings.PROJECTSETTINGS.INVALID_YML(file_path)
      )
    }

    //  -- set project settings variable -----------------------------------------
    const project_settings:ps_props = read_result.value || {}
    this.stackToAbsPath(project_settings, file_path)
    result.absorb(
      this.stacksDirToAbsPath(project_settings, file_path)
    )
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
