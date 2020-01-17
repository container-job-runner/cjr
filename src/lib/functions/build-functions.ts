import {BuildDriver} from '../drivers/abstract/build-driver'
import {ValidatedOutput} from '../validated-output'
import {ErrorStrings} from '../error-strings'

export function buildIfNonExistant(builder: BuildDriver, stack_path: string, overloaded_config_paths: array<string>=[])
{
  if(builder.isBuilt(stack_path))
  {
    return new ValidatedOutput(true);
  }
  else
  {
    const result = builder.build(stack_path, overloaded_config_paths)
    if(result.success == true)
    {
        result.success = builder.isBuilt(stack_path)
        if(result.success == false) result.pushError(ErrorStrings.BUILD.FAILED_AUTOBUILD)
    }
    return result;
  }
}