import {ValidatedOutput} from '../validated-output'
import {ErrorStrings} from '../error-strings'
import * as chalk from 'chalk'

type Dictionary = {[key: string]: any}

export function ajvValidatorToValidatedOutput(ajv_validator: any, raw_object:Dictionary)
{
  return (ajv_validator(raw_object)) ? new ValidatedOutput(true, raw_object) :
    new ValidatedOutput(false, undefined,
      [ErrorStrings.YML.INVALID(ajv_validator.errors.map( (x:any) => x.message).join("\n"))]
    )
}

export function printResultState(result: ValidatedOutput)
{
  result.warning.forEach( (e:string) => console.log(chalk`{bold.yellow WARNING}: ${e}`))
  result.error.forEach( (e:string) => console.log(chalk`{bold.red ERROR}: ${e}`))
}

// For better validation of type in configurators
// https://spin.atomicobject.com/2018/03/26/typescript-data-validation/
//https://github.com/epoberezkin/ajv/issues/736
