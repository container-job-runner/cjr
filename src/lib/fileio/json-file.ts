import {ValidatedOutput} from "../validated-output"
import {TextFile} from "./text-file"

export class JSONFile extends TextFile
{
  protected extension: string = "json"

  write(name:string, data:any) {
    return super.write(name, JSON.stringify(data))
  }

  read(name:string) : ValidatedOutput<any>
  {
    const result = super.read(name)
    if(result.success)
    {
      try
      {
        return new ValidatedOutput(true, JSON.parse(result.value))
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
