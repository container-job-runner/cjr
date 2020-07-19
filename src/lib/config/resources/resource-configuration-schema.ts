import * as Ajv from 'ajv'
import {ajvValidatorToValidatedOutput} from '../../functions/misc-functions'

export const resource_configuration_schema = {
  "$id": "resource-configuration-schema.json",
  "title": "Remote Resource Configuration Schema",
  "description": "file format for storing remote resource configuration",
  "type": "object",
  "additionalProperties": {"$ref": "#/definitions/resource"},
  "definitions": {
    "resource": {
      "type": "object",
      "properties": {
        "type" : {
          "type:": "string",
          "pattern": "^(ssh)$"
        },
        "address": {"type": "string"},
        "username": {"type": "string"},
        "key" : {"type:": "string"},
        "options" : {
            "type:": "object"
        }
      },
      "additionalProperties": false,
      "required": ["type", "address", "username", "options"]
    }
  }
}

// Ajv validator for validating schema
type Dictionary = {[key:string] : any}
const ajv = new Ajv({schemas: [resource_configuration_schema]})
export const rc_ajv_validator = ajv.getSchema(resource_configuration_schema["$id"])
export const rc_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(rc_ajv_validator, raw_object)
