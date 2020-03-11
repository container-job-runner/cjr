import * as path from 'path'
import * as os from 'os'
import * as chalk from 'chalk'

//cli names
export const cli_name = "cjr"

// labels
export const job_info_label = "jobinfo"
export const file_volume_label = 'filevolume'

// flag message
// export const invalid_stack_flag_error = "specify stack flag --stack=stack or set environment variable STACK"
export const missingFlagError = (flags: Array<string>) => chalk`The following flags could not be set automatically and must be specified manually:\n{italic ${flags.map((f:string, i:number) => `${i+1}. ${f}`).join("\n")}}`

// name of files and directories in cli settings directory
export const cli_settings_yml_name = "settings"
// name of folders in data directory
export const cli_bundle_dir_name  = "bundle"  // temporarily stores data between container transfer

// name of optional project settings file that is loaded relative to project project_root
export const project_settings_folder = `.${cli_name}`
export const project_settings_file   = "project-settings.yml"
export const projectSettingsYMLPath  = (project_root: string) => path.join(project_root, project_settings_folder, project_settings_file)

// name of optional id file in settings folder
export const project_idfile = "project-id.json"
export const projectIDPath  = (hostRoot: string) => path.join(hostRoot, project_settings_folder, project_idfile)

// default cli options that are stored in cli settings json file
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
      // cli-props
      auto_project_root: true,
      interactive: true,
      stacks_dir: path.join(settings_dir, "stacks"),
      alway_print_job_id: false,
      autocopy_sync_job: true,
      run_shortcuts_file: "",
      build_cmd: cmd,
      run_cmd: cmd,
      image_tag: cli_name,
      // container props
      container_default_shell: "bash",
      selinux: false,
      jupyter_command: "jupyter lab",
  }
}

// volume rsync options
export const rsync_constants = {
  source_dir: "/rsync/source/", // note trailing slash so that contents of source are copied into dest, not folder source
  dest_dir:   "/rsync/dest",
  config_dir: "/rsync/config",
  stack_path: "buvoli/alpine-rsync:cjr",
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
export const DefaultContainerRoot = "/"                                         // Note: though this choice may lead to collisions, it always works docker cp which does not create subfolders.

// Jupyter options
export const JUPYTER_JOB_NAME = "JUPYTER"

// X11 options
export const X11_POSIX_BIND = "/tmp/.X11-unix"
