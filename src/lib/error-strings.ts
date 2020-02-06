import * as chalk from 'chalk'

export const ErrorStrings = {
  CONFIG:{
    NON_EXISTANT_BIND_HOSTPATH : (stackPath: string, hostPath: string) => chalk`{bold Invalid Stack Configuration} - bind mount contains nonexistant host path.\n     {italic stack}: ${stackPath}\n  {italic hostPath}: ${hostPath}`
  },
  CLI_SETTINGS:{
    INVALID_FIELD: (field: string) => chalk`{bold ${field} is not a valid property.}`
  },
  JOBS:{
    INVALID_ID: chalk`{bold Invalid ID} - ID string must be at least 1 character long.`,
    NO_MATCHING_ID: chalk`{bold No Matching Job ID}`
  },
  BUILD:{
    FAILED_AUTOBUILD: chalk`{bold Failed to Build Stack Image.}`
  },
  YML:{
    INVALID: (yml_error_str: string) => chalk`{bold Yml failed validation} - validator error shown below.\n${yml_error_str}`
  },
  PROJECTIDFILE: {
    EMPTY: (path:string ) => chalk`{bold Project ID File cannot be empty} - the file ${path} was empty.`
  },
  JOBSHELL: {
    NOSTACK: chalk`{bold Stack flag empty } - you must specify a stack`
  },
  JOBINFOLABEL: {
    INVALIDJSON: chalk`{bold Invalid JSON } - could not parse job json.`
  }
}

export const WarningStrings = {
  PROJECTSETTINGS:{
    INVALID_YML : (yml_path: string) => chalk`{bold Invalid YML} - the configuration file listed below was ignored.\n  {italic filePath}: ${yml_path}`,
    MISSING_CONFIG_FILE: (yml_path: string, config_path: string) => chalk`{bold Missing Configuration File} - a configuration file referenced in project settings yml does not exist.\n {italic yml:       } ${yml_path}\n {italic configFile}: ${config_path}`
  },
  X11:{
    FLAGUNAVALIABLE: chalk`{bold X11 flag ignored} - the X11 flag is not supported on your operating system.`,
    MISSINGDIR: (dir_path: string) => chalk`{bold missing X11 directory} - the directory "${dir_path}" is not present. Is X running?`,
    MACMISSINGSOCKET: (dir_path: string) => chalk`{bold missing X11 socket} - no socket found in directory "${dir_path}". Is XQuartz running?`,
  },
  BUNDLE:{
    INVALIDBINDPATH: (dir_path: string) => chalk`{bold A bind mount was removed from bundle} - to ensure the stack is repoducible on other systems, bundle only keeps bind paths that point to locations inside the stack folder.\n  {italic bind path: } ${dir_path}`,
    VOLUMEDATA: (vol_name: string) => chalk`{bold Volume present in configuration} - note that volume data is not preserved in bundle.\n  {italic volume}: ${vol_name}`
  }
}
