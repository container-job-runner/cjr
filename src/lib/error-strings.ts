import * as chalk from 'chalk'


export const ErrorStrings = {
    CONFIG:{
      NON_EXISTANT_BIND_HOSTPATH : (stackPath, hostPath) => chalk`{bold Invalid Stack Configuration} - bind mount contains nonexistant host path.\n {italic stackPath}: ${stackPath}\n  {italic hostPath}: ${hostPath}`
    }
}

export const WarningStrings = {
  SETTINGS:{
    IGNORED_YML : (yml_path) => chalk`{bold Invalid YML File} - the configuration file listed below was ignored, likely due to improper format.\n  {italic filePath}: ${yml_path}`,
    MISSING_CONFIG_FILE: (yml_path, config_path) => chalk`{bold Missing Configuration File} - a configuration file referenced in project settings yml does not exist.\n {italic yml:       } ${yml_path}\n {italic configFile}: ${config_path}`
  }
}
