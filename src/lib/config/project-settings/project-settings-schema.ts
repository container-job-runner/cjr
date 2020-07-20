import * as Ajv from 'ajv'
import { ajvValidatorToValidatedOutput } from '../../functions/misc-functions'
import { Dictionary } from '../../constants'

export const project_settings_schema = {
  "$id": "project-schema.json",
  "title": "Project Settings Schema",
  "description": "Scheme for optional file .cjr/project-settings.yml",
  "type": "object",
  "properties": {
    "project-root" : {"$ref": "#/definitions/project-root"},
    "stack": {"type": "string"},
    "visible-stacks": {"$ref": "#/definitions/array-of-strings"},
    "stacks-dir": {"type": "string"},
    "resource": {"type": "string"},
    "default-profiles": {"$ref": "#/definitions/default-profiles"}
  },
  "definitions": {
    "project-root": {
      "type": "string",
      "pattern": "^auto$"
    },
    "array-of-strings": {
      "type": "array",
      "items": {
        "anyOf" : [ {"type": "string"} ]
      }
    },
    "default-profiles": {
      "type": "object",
      "additionalProperties": { "$ref": "#/definitions/array-of-strings" },
    }
  },
  "additionalProperties": false
}

// Ajv validator for validating schema
const ajv = new Ajv({schemas: [project_settings_schema]})
export const ps_ajv_validator = ajv.getSchema(project_settings_schema["$id"])
export const ps_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(ps_ajv_validator, raw_object)
