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
    NO_MATCHING_ID: chalk`{bold No Matching Job ID}`,
    FAILED_START : chalk`{bold Failed to start job}`
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
  },
  STACK: {
    NO_STACK_SPECIFIED: (stack_name:string, stack_path: string) => ` Removing image for stack ${stack_name} (${stack_path})`
  }
}

export const WarningStrings = {
  PROJECTSETTINGS:{
    INVALID_YML : (yml_path: string) => chalk`{bold Invalid YML} - the configuration file listed below was ignored.\n  {italic filePath}: ${yml_path}`,
    MISSING_CONFIG_FILE: (yml_path: string, config_path: string) => chalk`{bold Missing Configuration File} - a configuration file referenced in project settings yml does not exist.\n {italic yml:       } ${yml_path}\n {italic configFile}: ${config_path}`,
    MISSING_STACKS_PATH: (yml_path: string, stacks_dir: string) => chalk`{bold Missing Stacks Directory} - the stack directory referenced in project settings yml does not exist.\n {italic yml:      } ${yml_path}\n {italic stacks-dir}: ${stacks_dir}`
  },
  OPENRULES:{
      INVALID_YML : (yml_path: string) => chalk`{bold Invalid YML} - the open rules yml file listed below was ignored.\n  {italic filePath}: ${yml_path}`,
  },
  X11:{
    FLAGUNAVALIABLE: chalk`{bold X11 flag ignored} - the X11 flag is not supported on your operating system.`,
    MISSINGDIR: (dir_path: string) => chalk`{bold missing X11 directory} - the directory "${dir_path}" is not present. Is X running?`,
    MACMISSINGSOCKET: (dir_path: string) => chalk`{bold missing X11 socket} - no socket found in directory "${dir_path}". Is XQuartz running?`,
    XQUARTZ_NOREMOTECONNECTION: chalk`{bold Your XQuartz settings block network connections}. You can change this manually by selecting "allow connections from network clients" in XQuartz > Preferences > Security`
  },
  JOBCOPY:{
    NO_VOLUME : (id:string) => chalk`{bold No Copy Required:} job ${id} has no associated volume.`,
    NO_HOSTROOT : (id:string) => chalk`{bold No Copy Required:} job ${id} has no associated hostRoot.`
  },
  JOBEXEC:{
    NO_VOLUME : (id:string) => chalk`{bold No Associated Job File volume:} job ${id} has no associated volume; job:exec and job:shell can only be used on jobs that where started with --file-access=volume`,
    NO_HOSTROOT : (id:string) => chalk`{bold No Associated Job Files:} job ${id} has no associated hostRoot.`
  },
  BUNDLE : {
    FAILED_BUNDLE_STACK: (stack_path: string) => chalk`{bold Unable to Bundle Stack:} - verify that the stack contains necessary files and builds correctly.\n  {italic stack:} ${stack_path}`,
    INVALID_STACK_BINDPATH: (dir_path: string, stack_path: string) => chalk`{bold A bind mount was removed from bundled stack} - to ensure the stack is repoducible on other systems, bundle only keeps bind paths that point to locations inside the stack folder.\n  {italic bind path:}   ${dir_path}\n  {italic stack path:} ${stack_path}`,
  }
}

export const StatusStrings = {
  JOBSTART:{
    BUILD : "Build Output",
    VOLUMECOPY : "rsync Output",
    START : "Job Output",
    JOB_ID : "Job Id"
  },
  BUNDLE:{
    STACK_BUILD: (stack_name:string) => `Building ${stack_name}`,
    PROJECT_SETTINGS: `Bundling Project Settings`,
    COPYING_FILES: `Copying Project Files`
  }
}
