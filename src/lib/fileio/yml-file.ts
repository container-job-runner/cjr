import {ValidatedOutput} from "../validated-output"
import {TextFile} from "./text-file"

export class YMLFile extends TextFile
{
  private extension: string = "yml"

  write(name:string, data:object) {
    return super.write(name, yml.safeDump(data))
  }

  read(name:string)
  {
    var result = super.read(name)
    if(result.success)
    {
      try
      {
        return new ValidatedOutput(true, yaml.safeLoad(result.data))
      }
      catch(e)
      {
        return new ValidatedOutput(false, e)
      }
    }
    return result
  }

}
