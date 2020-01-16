import {ValidatedOutput} from '../validated-output'
import {ErrorStrings} from '../error-strings'

export function ajvValidatorToValidatedOutput(ajv_validator, raw_object)
{
  return (ajv_validator(raw_object)) ? new ValidatedOutput(true, raw_object) :
    new ValidatedOutput(false, undefined,
      [ErrorStrings.YML.INVALID(ajv_validator.errors.map(x => x.message).join("\n"))]
    )
}

// For better validation of type in configurators
// https://spin.atomicobject.com/2018/03/26/typescript-data-validation/
//https://github.com/epoberezkin/ajv/issues/736
