import * as Ajv from 'ajv'
import { ajvValidatorToValidatedOutput } from '../../functions/misc-functions'

export const run_shortcuts_schema = {
  "$id": "run-shortcuts.json",
  "title": "Shortcuts for $ command",
  "description": "schema for rules that match file types with a run command for the $ command",
  "type": "object",
  "additionalProperties": { "type": "string" }
}

// Ajv validator for validating schema
type Dictionary = {[key:string] : any}
const ajv = new Ajv({schemas: [run_shortcuts_schema]})
export const rs_ajv_validator = ajv.getSchema(run_shortcuts_schema["$id"])
export const rs_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(rs_ajv_validator, raw_object)
