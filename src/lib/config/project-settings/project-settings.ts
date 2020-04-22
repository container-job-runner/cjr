import * as fs from 'fs'
import * as path from 'path'
import {JSTools} from '../../js-tools'
import {YMLFile} from '../../fileio/yml-file'
import {ValidatedOutput} from '../../validated-output'
import {WarningStrings} from '../../error-strings'
import {ps_vo_validator} from './project-settings-schema'

export type ps_props = {
  "project-root"?: string,
  "stack"?: string,
  "config-files"?: Array<string>,
  "stacks-dir"?: string,
  "remote-name"?: string,
  "visible-stacks"?: Array<string>
}

export type ps_fields = "project-root"|"stack"|"config-files"|"stacks-dir"|"remote-name"|"visible-stacks"

export class ProjectSettings
{
  private yml_file = new YMLFile("", false, ps_vo_validator)
  private raw_object: ps_props = {}

  constructor(file_path?: string)
  {
    if(file_path) this.loadFromFile(file_path)
  }

  set(options:ps_props)
  {
    JSTools.rMerge(this.raw_object, options)
  }

  get(prop:ps_fields)
  {
    return this.raw_object[prop]
  }

  getMultiple(props:Array<ps_fields>)
  {
    const values:{[key: string]: any} = {}
    props.map((p:ps_fields) => {
      if(this.raw_object[p] !== undefined)
        values[p] = this.raw_object[p]
    })
    return values
  }

  remove(prop:ps_fields)
  {
    delete this.raw_object[prop]
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
    const project_settings:ps_props = read_result.data || {}
    this.stackToAbsPath(project_settings, file_path)
    const r1 = this.stacksDirToAbsPath(project_settings, file_path)
    const r2 = this.configFilesToAbsPath(project_settings, file_path)
    this.raw_object = project_settings
    return r1.absorb(r2)
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
  private configFilesToAbsPath(props: ps_props, file_path: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    if(!props?.["config-files"]) return result
    // conver config files to absolue
    props["config-files"] = this.pathsToExistingAbs(
      props["config-files"],
      path.dirname(file_path),
      (path_str:string) => {
        result.pushWarning(WarningStrings.PROJECTSETTINGS.MISSING_CONFIG_FILE(file_path, path_str))
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
  private pathsToExistingAbs(paths:Array<string>, parent_abs_path: string, onFail:(path:string) => void = (path:string) => {})
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
