import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import {ValidatedOutput} from "../validated-output"
import {TextFile} from "./text-file"

export class YMLFile extends TextFile
{
  private extension: string = "yml"
  private schema: object = undefined

  write(name:string, data_str:object) {
    super.write(name, yml.safeDump(data))
  }

  read(name:string)
  {
    var result = super.read(name)
    if(result.success) {
      try {
        return new ValidatedOutput(true, yaml.safeLoad(result.data))
      }
      catch(e) {
        return new ValidatedOutput(false, e)
      }
    }
  }

}
