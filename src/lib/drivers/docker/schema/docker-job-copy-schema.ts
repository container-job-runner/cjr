import * as Ajv from 'ajv'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const docker_job_copy_schema = {
  "$id": "job-copy-object.json",
  "title": "Configuration for a Docker Job Copy",
  "description": "Used internally in DockerRunDriver to copy job result",
  "type": "object",
  "properties": {
    "hostRoot": {
      "anyOf" : [
        {"type": "string"},
        {"type": "boolean"}
      ]
    },
    "containerRoot": {"type": "string"},
    "resultPaths": {
      "type": "array",
      "items": [
        {
          "type": "string"
        }
      ]
    }
  },
  "dependencies": {
      "hostRoot": ["containerRoot"],
      "resultPaths": ["hostRoot"]
    }
}

// Ajv validator for validating schema
type Dictionary = {[key:string] : any}
var ajv = new Ajv({schemas: [docker_job_copy_schema]})
export const djc_ajv_validator = ajv.getSchema(docker_job_copy_schema["$id"])
export const djc_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(djc_ajv_validator, raw_object)
