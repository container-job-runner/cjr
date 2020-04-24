import {BuildDriver} from '../drivers/abstract/build-driver'
import {ValidatedOutput} from '../validated-output'
import {ErrorStrings} from '../error-strings'
import {StackConfiguration} from '../config/stacks/abstract/stack-configuration'

export type BuildOptions = {
  'never'?: boolean,          // image will never be build
  'reuse-image'?: boolean,     // will not build if image with proper name already exists
  'no-cache'?: boolean,       // if true will build image without cache
  'pull'?:  boolean           // if true will pull all linked images
}

// -----------------------------------------------------------------------------
// BUILDANDLOAD Calls function onSuccess if stack is build and successuffly
//  loaded. The following arguments are passed to onSuccess
//    1. configuration (Configuration) - the stack Configuration
//    2. containerRoot - the container project root folder
//    3. hostRoot (String | false) - the project hostRoot or false if non existsSync
// -- Parameters ---------------------------------------------------------------
// builder  - (BuildDriver) Object that inherits from abstract class Configuration
// flags    - (Object) command flags. The only optional propertes will affect this function are:
//              1. containerRoot
//              2. hostRoot
// stack_path - absolute path to stack folder
// overloaded_config_paths - absolute paths to any overloading configuration files
// -----------------------------------------------------------------------------
export function buildAndLoad(builder: BuildDriver, build_options: BuildOptions, stack_path: string, overloaded_config_paths: Array<string>) : ValidatedOutput<StackConfiguration>
{
  var result = builder.loadConfiguration(stack_path, overloaded_config_paths)
  if(!result.success) return result
  const configuration = result.value
  if(build_options?.['never']) // simply return configuration
    return new ValidatedOutput(true, configuration)
  else if(build_options?.['reuse-image']) // build if image is missing
    result.absorb(
      buildIfMissing(builder, stack_path, configuration, build_options)
    )
  else
    result.absorb(
      builder.build(stack_path, configuration, build_options)
    )
  if(!result.success) return result
  return new ValidatedOutput(true, configuration)
}

export function buildIfMissing(builder: BuildDriver, stack_path: string, configuration: StackConfiguration, build_options: BuildOptions) : ValidatedOutput<undefined>
{
  if(builder.isBuilt(stack_path, configuration))
  {
    return new ValidatedOutput(true, undefined);
  }
  else
  {
    const result = builder.build(stack_path, configuration, build_options)
    if(result.success == true)
    {
        result.success = builder.isBuilt(stack_path, configuration)
        if(result.success == false) result.pushError(ErrorStrings.BUILD.FAILED_AUTOBUILD)
    }
    return result;
  }
}

export function removeImage(builder: BuildDriver, stack_path: string, all_configurations: boolean, overloaded_config_paths: Array<string>=[])
{
  if(all_configurations === true)
    return builder.removeImage(stack_path)
  else
  {
    var result = builder.loadConfiguration(stack_path, overloaded_config_paths)
    if(!result.success) return result
    const configuration = result.value
    return builder.removeImage(stack_path, configuration)
  }
}
