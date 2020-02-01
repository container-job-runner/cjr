import * as path from 'path'
import * as os from 'os'

//cli names
export const cli_name = "cjr"

// flag message
export const invalid_stack_flag_error = "specify stack flag --stack=stack or set environment variable STACK"

// name of files and directories in cli settings directory
export const cli_settings_yml_name = "settings"
export const cli_jobs_dir_name     = "jobs"

// name of folders in data directory
export const cli_storage_dir_name = "storage" // temporarily stores data between container transfer
export const cli_bundle_dir_name  = "bundle"  // temporarily stores data between container transfer

// name of optional project settings file that is loaded relative to project hostRoot
export const project_settings_folder = `.${cli_name}`
export const project_settings_file   = "settings.yml"
export const projectSettingsYMLPath  = (hostRoot: string) => path.join(hostRoot, project_settings_folder, project_settings_file)

// name of optional id file in settings folder
export const project_idfile = "project-id.json"
export const projectIDPath  = (hostRoot: string) => path.join(hostRoot, project_settings_folder, project_idfile)

// default properties for settings.yml
export const default_settings_object = {stack: false, configFiles: []}

// default cli options that are stored in json file
export const defaultCLISettings = (settings_dir:string) =>
{
  let cmd
  switch(os.platform())
  {
    case "darwin":
    case "win32":
      cmd = "docker"
      break
    default:
      cmd = "podman"
  }

  return {
      stacks_path: path.join(settings_dir, "stacks"),
      build_cmd: cmd,
      run_cmd: cmd,
      image_tag: cli_name,
      default_shell: "bash",
      interactive: true
  }
}

// stack run options
export const DefaultContainerRoot = "/"                                         // Note: though this choice may lead to collisions, it always works docker cp which does not create subfolders.

// Jupyter options
export const JUPYTER_JOB_NAME = "JUPYTER"

// X11 options
export const X11_POSIX_BIND = "/tmp/.X11-unix"
