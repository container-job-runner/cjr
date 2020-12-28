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
  ATTACH:{
    NO_MATCHING_ID: chalk`{bold No Matching Running Job ID}`
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
    EMPTY: chalk`{bold Stack empty } - you must specify a stack`,
    INVALID_NAME: chalk`{bold Invalid Stack Name} - A stack name should only contain lowercase and uppercase letters, digits, underscores, periods and dashes.`
  },
  JUPYTER: {
    NOT_RUNNING: (identifier:{"job-id"?: string,"project-root"?: string}) => {
      if(identifier?.['project-root'])
        return chalk`Jupyter is not running in project directory "{green ${identifier['project-root']}}".`;
      if(identifier?.['job-id'])
        return chalk`Jupyter is not running in job {italic ${identifier['job-id']}}.`;
      else
        return chalk`Jupyter is not running.`;
    },
    NOURL: `Failed to obtain a url for the Jupyter server.`,
    LIST_FAILED: `Failed to obtain list of running Jupyter servers`
  },
  THEIA: {
    NOT_RUNNING: (project_root: string) => chalk`Theia is not running in project directory "{green ${project_root}}".`,
    NOURL: `Failed to obtain a url for the Theia.`,
    LIST_FAILED: `Failed to obtain list of running Theia servers`
  },
  SERVICES: {
      INVALID_PROJECT_ROOT: (project_root: string) => `the directory ${project_root} does not exist.`,
      EMPTY_PROJECT_ROOT: `You must specify a project root.`,
      UNREADY: `Container started successfully but service did not. Try re-running start or stop service then restart; if error persists, then the selected stack may not support this service.`,
      FAILED_TUNNEL_START: `SSH tunnel failed to initialized. You will not be able to access remote service.`
  },
  REMOTE_RESOURCE: {
    NAME_NON_EXISTANT : (name: string) => chalk`{bold Nonexistant Remote Resource} - a resource with the name "${name}" does not exist.`,
    KEYFILE_NON_EXISTANT : (path: string) => chalk`{bold Keyfile does not exist} - the file ${path} was not found.`,
    NO_KEY_PRESENT: (name: string) => chalk`{bold Remote Resource has no Key} - the resource ${name} does not have a specified ssh key file.`,
    NEW: {
      NAME_EXISTS: (name: string) => chalk`{bold Name Invalid} - a remote resource named ${name} already exists.`,
      KEYFILE_NONEXISTANT: (path: string) => chalk`{bold Keyfile does not exist} - the file ${path} was not found.`,
      LOCALHOST_NAME: chalk`{bold Name Invalid} - you cannot name a remote resource localhost.`
    }
  },
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
    MACFAILEDSTART: chalk`{bold X11 failed to start} - try staring XQuartz manually.`,
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

export const NoticeStrings = {
    JUPYTER: {
        RUNNING: (id:string, identifier:{"job-id"?: string,"project-root"?: string}) => {
        if(identifier?.['project-root'])
            return chalk`Jupyter is already running in project directory "{green ${identifier['project-root']}}".`;
        if(identifier?.['job-id'])
            return chalk`Jupyter is already running in job {italic ${identifier['job-id']}}.`;
        else
            return chalk`Jupyter is already running.`;
        }
    },
    THEIA: {
        RUNNING: (id:string, project_root: string) => chalk`Theia is already running in project directory "{green ${project_root}}".`
    },
    VNC: {
        RUNNING: (id:string, project_root: string) => chalk`vnc is already running in project directory "{green ${project_root}}".`
    }
}

export const StatusStrings = {
  JOBSTART:{
    BUILD : "Build Output",
    VOLUMECOPY : "rsync Output",
    VOLUMECOPY_TOVOLUME : "rsync Output (Host -> Volume)",
    VOLUMECOPY_TOHOST : "rsync Output (Volume -> Host)",
    START : "Job Output",
    JOB_ID : "Job Id"
  },
  BUNDLE:{
    STACK_BUILD: (stack_name:string) => `Building ${stack_name}`,
    PROJECT_SETTINGS: `Bundling Project Settings`,
    COPYING_FILES: `Copying Project Files`
  }
}
