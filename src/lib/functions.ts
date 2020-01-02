import {ValidatedOutput} from './validated-output'

export function ajvValidatorToValidatedOutput(ajv_validator, raw_object)
{
  return (ajv_validator(raw_object)) ? new ValidatedOutput(true) :
    new ValidatedOutput(false, [],
      [`Invalid Yml.\n\t${ajv_validator.errors.map(x => x.message).join("\n\t")}`]
    )
}

// For better validation of type in configurators
// https://spin.atomicobject.com/2018/03/26/typescript-data-validation/
//https://github.com/epoberezkin/ajv/issues/736
