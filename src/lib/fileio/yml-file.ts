import {ValidatedOutput} from "../validated-output"
import {TextFile} from "./text-file"
import * as yaml from 'js-yaml'

export class YMLFile extends TextFile
{
  protected extension: string = "yml"

  write(name:string, data:any) {
    return super.write(name, yaml.safeDump(data))
  }

  read(name:string) : ValidatedOutput<any>
  {
    var result = super.read(name)
    if(result.success)
    {
      try
      {
        return new ValidatedOutput(true, yaml.safeLoad(result.value))
      }
      catch(e)
      {
        return new ValidatedOutput(false, e)
      }
    }
    return result
  }

  validatedRead(name:string) : ValidatedOutput<any>
  {
    return super.validatedRead(name)
  }

}
