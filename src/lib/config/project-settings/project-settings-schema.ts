import * as Ajv from 'ajv'
import { ajvValidatorToValidatedOutput } from '../../functions/misc-functions'
import { Dictionary } from '../../constants'

export const project_settings_schema = {
  "$id": "project-schema.json",
  "title": "Project Settings Schema",
  "description": "Scheme for optional file .cjr/settings.yml",
  "type": "object",
  "properties": {
    "project-root" : {"$ref": "#/definitions/project-root"},
    "stack": {"type": "string"},
    "visible-stacks": {"$ref": "#/definitions/array-of-strings"},
    "config-files": {"$ref": "#/definitions/array-of-strings"},
    "stack-specific-config-files":  {"$ref": "#/definitions/array-of-sscf"},
    "stacks-dir": {"type": "string"},
    "remote-name": {"type": "string"}
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
    "array-of-sscf": {
      "type": "array",
      "items": {
        "anyOf" : [ {"$ref": "#/definitions/stack-specific-config-file"} ]
      }
    },
    "stack-specific-config-file": {
      "type": "object",
      "properties": {
        "stacks": {"$ref": "#/definitions/array-of-strings"},
        "config-files": {"$ref": "#/definitions/array-of-strings"}
      },
      "required": ["stacks", "config-files"],
      "additionalProperties": false
    }
  }
}

// Ajv validator for validating schema
const ajv = new Ajv({schemas: [project_settings_schema]})
export const ps_ajv_validator = ajv.getSchema(project_settings_schema["$id"])
export const ps_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(ps_ajv_validator, raw_object)
