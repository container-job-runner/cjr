import path = require('path')
import os = require('os')
import chalk = require('chalk')

// types
export type Dictionary = { [key:string] : any }

//cli names
export const cli_name = "cjr"

// job labels
export const label_strings = {
  "job" : {
    "type": "job-type",                           // label for special types of jobs (e.g. stash, exec)
    "project-root": "project-root",               // project-root
    "container-root": "container-root",           // linux path that cooresponds to container root where project-root is mounted
    "file-volume": "file-volume",                 // id of any associated file volume
    "parent-job-id": "parent-job",                // id of parent job for exec
    "name": "job-name",                           // a string that contains an optional job name
    "stack-path": "stack-path",                   // string containing path on host where underlying stack is located
    "stack-name": "stack-name",                   // name of job stack
    "download-include": 'rsync-include',          // contents of the file passed to rsync through the flag --include-from used when downloading files to host
    "download-exclude": 'rsync-exclude',          // contents of the file passed to rsync through the flag --exclude-from used when downloading files to host
    "message": "message"                          // an optional user message describing the job
  }
}

// flag message
// export const invalid_stack_flag_error = "specify stack flag --stack=stack or set environment variable STACK"
export const missingFlagError = (flags: Array<string>) => chalk`The following flags could not be set automatically and must be specified manually:\n{italic ${flags.map((f:string, i:number) => `${i+1}. ${f}`).join("\n")}}`

// name of files and directories in cli settings directory
export const cli_settings_yml_name = "settings"
export const project_settings = {
    "dirname": `.${cli_name}`,
    "filenames": { // names of important files in project settings directory
      "project-settings": "project-settings.yml",
      "id": "project-id.json"
    },
    "subdirectories" : {  // names of important folders in project settings directory
      "stacks": "stacks",
      "profiles": "profiles",
    }
}

// functions for quickly accessing filenames from project_root
export const projectSettingsDirPath  = (project_root: string) => path.join(project_root, project_settings.dirname)
export const projectSettingsYMLPath  = (project_root: string) => path.join(project_root, project_settings.dirname, project_settings.filenames["project-settings"])
export const projectIDPath  = (hostRoot: string) => path.join(hostRoot, project_settings.dirname, project_settings.filenames.id)
export const projectSettingsProfilePath  = (project_root: string) => path.join(project_root, project_settings.dirname, project_settings.subdirectories.profiles)

// name of subfolders in data directory
export const subdirectories =
{
  "data": {
    "bundle": "bundle",                         // used by bundle functions to store tmp data
    "build": "build",                           // used by socket drivers for storing tar and tar.gz files for building
    'job-copy': 'job-copy',                     // used as tmp data when copying results
    'podman-socket': 'podman-socket',           // used to store podman socket
    "ssh-sockets": "ssh-sockets"                // used to store ssh master sockets
  },
  "stack": {
    "build": "build",
    "profiles": "profiles"
  }
}

// default cli options that are stored in cli settings json file
export const defaultCLISettings = (config_dir:string, data_dir:string, cache_dir: string) =>
{
  let driver
  let socket
  switch(os.platform())
  {
    case "darwin":
    case "win32":
      driver = "docker-cli"
      socket = "/var/run/docker.sock"
      break
    default:
      driver = "podman-cli"
      socket = path.join(data_dir, subdirectories.data["podman-socket"], "podman.sock")
  }

  return {
      // cli-props
      "auto-project-root": true,
      "interactive": true,
      "stacks-dir": path.join(config_dir, "stacks"),
      "always-print-job-id": false,
      "autocopy-sync-job": true,
      "job-default-run-mode": "sync",
      "run-shortcuts-file": "",
      "driver": driver,
      "image-tag": cli_name,
      "socket-path": socket,
      "job-ls-fields": 'id, stackName, command, status',
      'container-registry-auth': 'https://index.docker.io/v1/',
      'container-registry-user': '',
      // container props
      "default-container-shell": "bash",
      "selinux": false,
      "jupyter-command": "jupyter lab",
      "webapp": "",
      "timeout-jupyter": "10",
      "timeout-theia": "10",
      "xquartz-autostart": false
  }
}

// volume rsync options
export const rsync_constants = {
  source_dir: "/rsync/source/", // note trailing slash so that contents of source are copied into dest, not folder source
  dest_dir:   "/rsync/dest",
  config_dir: "/rsync/config",
  manual_working_dir: "/rsync/",
  image: "cjrun/alpine-rsync:latest",
  include_file_name: 'includes',
  exclude_file_name: 'excludes'
}

// relative paths of rsync config files used for stackBundle() - paths are relative to bundle root folder
export const stack_bundle_rsync_file_paths = {
  upload: {
    exclude: "upload-exclude",
    include: "upload-include"
  },
  download: {
    exclude: "download-exclude",
    include: "download-include"
  }
}

// stack run options
export const DefaultContainerRoot = "/"

// X11 options
export const X11_POSIX_BIND = "/tmp/.X11-unix"

// snapshot options
export const SNAPSHOT_LATEST_TAG = 'latest'
