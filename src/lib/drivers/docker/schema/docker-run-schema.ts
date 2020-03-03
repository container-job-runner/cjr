import * as Ajv from 'ajv'
import {docker_stack_configuration_schema} from '../../../config/stacks/docker/schema/docker-stack-configuration-schema'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const docker_run_schema = {
  "$id": "docker-run.json",
  "title": "Docker Run Configuration",
  "description": "Used internally by DockerRunDriver in run command",
  "type": "object",
  "properties": {
    "command": {"type": "string"},
    "mounts": {"$ref": "docker-configuration-schema.json#/definitions/mounts"},
    "ports": {"$ref": "docker-configuration-schema.json#/definitions/ports"},
    "environment": {"$ref": "docker-configuration-schema.json#/definitions/args"},
    "resources": {"$ref": "docker-configuration-schema.json#/definitions/resources"},
    "wd": {"type": "string"},
    "detached": {"type": "boolean"},
    "interactive": {"type": "boolean"},
    "remove": {"type": "boolean"},
    "name": {"type": "string"},
    "labels": {
      "type": "object",
      "additionalProperties" : {
        "type": "string"
      }
    },
    "flags": {"$ref": "#/definitions/extra-docker-flags"}
  },
  "definitions": {
      "extra-docker-flags" : {
        "type": "object",
        "properties": {
          "network" : {
            "type": "string",
            "pattern": "^(host)$"
          },
        }
      }
  }
}

// create new Ajv validator for docker_run_schema
type Dictionary = {[key:string] : any}
var ajv = new Ajv({schemas: [docker_run_schema, docker_stack_configuration_schema]})
export const dr_ajv_validator = ajv.getSchema(docker_run_schema["$id"])
export const dr_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(dr_ajv_validator, raw_object)

//https://ajv.js.org
//https://www.jsonschemavalidator.net
//https://jsonschema.net
//https://json-schema.org/understanding-json-schema/structuring.html
