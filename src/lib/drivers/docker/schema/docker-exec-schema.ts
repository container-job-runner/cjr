import * as Ajv from 'ajv'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const docker_exec_schema = {
  "$id": "docker-exec.json",
  "title": "Docker exec Configuration",
  "description": "Used internally by DockerRunDriver in exec command",
  "type": "object",
  "properties": {
    "wd": {"type": "string"},
    "detached": {"type": "boolean"},
    "interactive": {"type": "boolean"},
  }
}

// Ajv validator for validating schema
var ajv = new Ajv({schemas: [docker_exec_schema]})
export const de_ajv_validator = ajv.getSchema(docker_exec_schema["$id"])
export const de_vo_validator  = (raw_object) => ajvValidatorToValidatedOutput(de_ajv_validator, raw_object)