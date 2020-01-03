import * as path from 'path'

export const project_settings_yml_path = (hostRoot: string) => path.join(hostRoot, ".cjr", "settings.yml")

// For better validation of type in configurators
// https://spin.atomicobject.com/2018/03/26/typescript-data-validation/
//https://github.com/epoberezkin/ajv/issues/736
