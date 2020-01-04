import * as path from 'path'
import * as os from 'os'

// flag message
export const invalid_stack_flag_error = "specify stack flag --stack=stack or set environment variable STACK"

// name of files and directories in cli settings directory
export const cli_settings_yml_name = "settings"
export const cli_jobs_dir_name = "jobs"

// name of optional project settings file that is loaded relative to project hostRoot
export const projectSettingsYMLPath = (hostRoot: string) => path.join(hostRoot, ".cjr", "settings.yml")

// default cli options that are stored in json file
export const defaultCLISettings = (settings_dir, cli_name) =>
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
      image_tag: cli_name
  }
}

// stack run options
export const DefaultContainerRoot = "/"                                         // Note: though this choice may lead to collisions, it always works docker cp which does not create subfolders.

// Jupyter options
export const JUPYTER_JOB_NAME = (image_name) => `${image_name}_jupyter`.replace(/[^a-zA-Z0-9_.-]/g,"")
