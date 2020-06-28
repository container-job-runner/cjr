import * as chalk from 'chalk'

export const ErrorStrings = {
  REMOTE_RESOURCE: {
    NAME_NON_EXISTANT : (name: string) => chalk`{bold Nonexistant Remote Resource} - a resource with the name ${name} does not exist.`,
    KEYFILE_NON_EXISTANT : (path: string) => chalk`{bold Keyfile does not exist} - the file ${path} was not found.`,
    NEW: {
      NAME_EXISTS: (name: string) => chalk`{bold Name Invalid} - a remote resource named ${name} already exists.`,
      KEYFILE_NONEXISTANT: (path: string) => chalk`{bold Keyfile does not exist} - the file ${path} was not found.`,
      LOCALHOST_NAME: chalk`{bold Name Invalid} - you cannot name a remote resource localhost.`
    }
  },
  REMOTEJOB: {
    NO_MATCHING_ID: chalk`{bold No Matching Remote Job IDs}`,
    EMPTY_ID: chalk`{bold Empty Job ID} - you must select a remote job id.`,
    COPY: {
      EMPTY_LOCAL_HOSTROOT: chalk`{bold Empty HostRoot} - you must set a hostroot to copy jobs.`,
      DIFFERING_PROJECT_ID: (id:string) => chalk`{bold Differing Project IDs} - the job ${id} was started from a project with a different id. Use flag --force if you want to copy files into current project.`
    },
    LABEL: {
      INVALID_JSON: chalk`{bold Invalid Job Label JSON} - job label information could not be retrieved since json data was invalid.`
    }
  }
}

export const WarningStrings = {
  REMOTEJOB: {
    COPY: {
      EMPTY_REMOTE_HOSTROOT: (id:string) => chalk`{bold Empty Job Project-Root} - no copy required for job ${id} since it has no associated files`
    },
    DELETE:{
      NO_MATCHING_REMOTEJOBS: chalk`{bold No Matching Remote IDs} - all the jobs with matching ids where not started remotely`,
      NO_MATCHING_JOBS: chalk`{bold No Matching IDs} - no jobs on remote resource match with specified id`
    },
    LABELS: {
      INVALID_JOBINFO_JSON: (id:string) => chalk`{bold Invalid JobInfo Label} - Could retrieve job information for ${id} since info label contained invalid json.`
    },
    NO_MATCHING_ID: chalk`{bold No Matching Remote Job IDs}`,
  }
}

export const StatusStrings = {
  REMOTEJOB:{
    START: {
      CREATING_DIRECTORIES: chalk`{bold Creating Remote Directories... }`,
      UPLOADING_STACK: chalk`{bold Uploading Stack... }`,
      UPLOADING_FILES: chalk`{bold Uploading Files... }`,
      RUNNING_JOB: chalk`{bold Running Job... }`,
      STARTING_JOB: chalk`{bold Starting Job... }`,
      DOWNLOADING_FILES: chalk`{bold Downloading Results... }`,
    },
    SHELL: {
      READING_JOBINFO: chalk`{bold Reading Job Info... }`,
      UPLOADING_STACK: chalk`{bold Uploading Stack... }`
    },
    COPY: {
      READING_JOBINFO: chalk`{bold Reading Job Info... }`,
      DOWNLOADING_FILES: chalk`{bold Downloading Files... }`,
    },
    DELETE: {
      READING_JOBINFO: chalk`{bold Reading Job Info... }`,
      JOBS: chalk`{bold Deleting Jobs... }`,
      IMAGES: chalk`{bold Removing Associated Images... }`,
      REMOTE_DIRECTORIES: chalk`{bold Deleting Associated Remote Directories... }`,
    },
    FILES: {
      SCP_DOWNLOAD: (index: number, remote_path: string, local_path: string) => chalk`{bold ${index}.} {green ${remote_path}} {bold ->} {green ${local_path}}`
    },
    DONE: chalk`{bold done.}`,
  }
}
