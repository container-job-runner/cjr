import * as path from 'path'
import * as os from 'os'

export const cli_settings_yml_name = "settings"

export const projectSettingsYMLPath = (hostRoot: string) => path.join(hostRoot, ".cjr", "settings.yml")

export const defaultCLISettings = (settings_dir) =>
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
      image_tag: this.cli_name
  }
}


// For better validation of type in configurators
// https://spin.atomicobject.com/2018/03/26/typescript-data-validation/
//https://github.com/epoberezkin/ajv/issues/736
