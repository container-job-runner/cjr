import {BuildDriver} from '../drivers/abstract/build-driver'
import {ValidatedOutput} from '../validated-output'
import {ErrorStrings} from '../error-strings'
import {StackConfiguration} from '../config/stacks/abstract/stack-configuration'

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
export function buildAndLoad(builder: BuildDriver, build_mode: "no-rebuild"|"build"|"build-nocache", stack_path: string, overloaded_config_paths: Array<string>)
{
  var result = builder.loadConfiguration(stack_path, overloaded_config_paths)
  if(!result.success) return result
  const configuration = result.data

  if(build_mode === "no-rebuild")
    result = buildIfNonExistant(builder, stack_path, configuration)
  else if(build_mode == "build")
    result = builder.build(stack_path, configuration)
  else if(build_mode == "build-nocache")
    result = builder.build(stack_path, configuration, true)
  else
    return new ValidatedOutput(false).pushError('Internal Error - Invalid Build Mode')

  if(!result.success) return result
  return new ValidatedOutput(true, configuration)
}

export function buildIfNonExistant(builder: BuildDriver, stack_path: string, configuration: StackConfiguration)
{
  if(builder.isBuilt(stack_path, configuration))
  {
    return new ValidatedOutput(true);
  }
  else
  {
    const result = builder.build(stack_path, configuration)
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
    const configuration = result.data
    return builder.removeImage(stack_path, configuration)
  }
}
