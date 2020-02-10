import * as Ajv from 'ajv'
import {ajvValidatorToValidatedOutput} from '../../functions/misc-functions'

export const project_settings_schema = {
  "$id": "project-schema.json",
  "title": "Project Settings Schema",
  "description": "Scheme for optional file .cjr/settings.yml",
  "type": "object",
  "properties": {
    "hostRoot" : {"$ref": "#/definitions/hostRoot"},
    "stack": {"$ref": "#/definitions/path"},
    "configFiles": {"$ref": "#/definitions/configFiles"}
  },
  "definitions": {
    "path": {
      "type": "string"
    },
    "configFiles": {
      "type": "array",
      "items": {
        "anyOf" : [ {"$ref": "#/definitions/path"} ]
      }
    },
    "hostRoot": {
      "type": "string",
      "pattern": "^auto$"
    },
    "remoteName": {
      "type": "string"
    }
  }
}

// Ajv validator for validating schema
type Dictionary = {[key:string] : any}
const ajv = new Ajv({schemas: [project_settings_schema]})
export const ps_ajv_validator = ajv.getSchema(project_settings_schema["$id"])
export const ps_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(ps_ajv_validator, raw_object)
