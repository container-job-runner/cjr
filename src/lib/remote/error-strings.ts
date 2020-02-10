import * as chalk from 'chalk'

export const ErrorStrings = {
  NEWENTRY: {
    NAME_EXISTS: (name: string) => chalk`{bold Name Invalid} - a remote resource named ${name} already exists.`,
    KEYFILE_NONEXISTANT: (path: string) => chalk`{bold Keyfile does not exist} - the file ${path} was not found.`
  },
  REMOTENAME: {
    NON_EXISTANT : (name: string) => chalk`{bold Nonexistant Remote Resource} - a resource with the name ${name} does not exist.`
  },
  KEY: {
    NON_EXISTANT : (path: string) => chalk`{bold Keyfile does not exist} - the file ${path} was not found.`
  },
  COPYJOB: {
    EMPTY_ID: chalk`{bold Invalid Job ID} - no job id was selected.`,
    EMPTY_LOCAL_HOSTROOT: chalk`{bold Empty HostRoot} - you must set a hostroot to copy a job.`,
    NO_MATCHING_ID: chalk`{bold No Matching Job IDs}`,
    UNREADABLE_PROJECT_ID: chalk`{bold Unreadable Project ID file} - copy was canceled after job project id file could not be retrieved. Use flag --force if you still want to copy files.`,
    DIFFERING_PROJECT_ID: chalk`{bold Differing Project IDs} - this job was started from a different project. Use flag --force if you want to copy files into current project.`,
    DIFFERING_PROJECT_DIRNAME: chalk`{bold Different Project Folder Names} - this job was started from a differently named project folder. Use flag --force if you want to copy files into current project.`
  },
  DELETEJOB: {
    INVALID_JOB_DATA: chalk`{bold Invalid Job Data} - delete failed. No job information could be retrieved.`,
    EMPTY_ID: chalk`{bold Invalid Job ID} - no job id was selected.`,
    NO_MATCHING_ID: chalk`{bold No Matching Job ID}`
  },
  SHELLJOB: {
    EMPTY_ID: chalk`{bold Invalid Job ID} - no job id was selected.`,
  }
}

export const StatusStrings = {
  STARTJOB: {
    UPLOADING_STACK: chalk`{bold Uploading Stack... }`,
    UPLOADING_FILES: chalk`{bold Uploading Files... }`,
    RUNNING_JOB: chalk`{bold Running Job... }`,
    DOWNLOADING_FILES: chalk`{bold Downloading Results... }`,
  },
  COPYJOB: {
    READING_JOBINFO: chalk`{bold Reading Job Info... }`,
    DOWNLOADING_FILES: chalk`{bold Downloading Files... }`,
    SCP_DOWNLOAD: (index: number, remote_path: string, local_path: string) => chalk`{bold ${index}.} {green ${remote_path}} {bold ->} {green ${local_path}}`
  },
  DONE: chalk`{bold done.}`
}

export const WarningStrings = {
  COPYJOB: {
    EMPTY_REMOTE_HOSTROOT: chalk`{bold Empty Job HostRoot} - no copy needed since job has no associated files`
  },
  DELETEJOB: {
    INVALID_JOB_LABEL: (id:string) => chalk`{bold Invalid Job Label} - Could not delete job ${id} since info label contained invalid json.`
  }
}
