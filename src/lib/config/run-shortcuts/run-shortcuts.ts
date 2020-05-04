import { YMLFile } from '../../fileio/yml-file'
import { ValidatedOutput } from '../../validated-output'
import { WarningStrings } from '../../error-strings'
import { rs_vo_validator } from './run-shortcuts-schema'

export class RunShortcuts
{
  private yml_file = new YMLFile("", false, rs_vo_validator)
  private rules: {[key: string]: string} = {} // keys are string regular expressions and values are replacements (e.g. rules = {".m$":"matlab $ARG"} will replace $ARG with matlab $ARG if $ARG.)

  loadFromFile(file_path: string)
  {
    const result = new ValidatedOutput(true, undefined)
    const read_result = this.yml_file.validatedRead(file_path)
    if(!read_result.success)
      return result.pushWarning(WarningStrings.OPENRULES.INVALID_YML(file_path))
    this.rules = read_result.value
    return result
  }

  // ---------------------------------------------------------------------------
  // APPLY manipulates a single arg and applies any applicable shortcut, or
  // leaves multiple args untouched
  // -- Parameters -------------------------------------------------------------
  // args: Array<string> - argument array that should be modified according to
  //                       rules. Note: rules will only be applied if there is
  //                       one arg
  // -- Returns ----------------------------------------------------------------
  // args: Array<string> - modified arguments with rules applied
  // ---------------------------------------------------------------------------
  apply(args: Array<string>)
  {
    if(args.length != 1) return args // exit if there are more than one args
    const arg = args[0]
    const search = Object.keys(this.rules).reduce(
      (accumulator:{found:boolean, rule:string}, regex_str:string) => {
        if(!accumulator.found && new RegExp(regex_str).test(arg))
          return {found: true, rule: regex_str}
        else return accumulator
      },
      {found:false, rule: ""}
    )
    if(search.found) return [this.rules[search.rule].replace("$ARG", arg)]
    else return args
  }

}
