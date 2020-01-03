import {TextFile} from "./text-file"
import {ValidatedOutput} from "../validated-output"
import {TextFile} from "./text-file"

export class JSONFile extends TextFile
{
  private extension: string = "json"

  write(name:string, data_str:object) {
    super.write(name, JSON.stringify(data))
  }

  read(name:string)
  {
    var result = super.read(name)
    if(result.success) {
      try {
        return new ValidatedOutput(true, JSON.parse(result.data))
      }
      catch(e) {
        return new ValidatedOutput(false, e)
      }
    }
  }

}
