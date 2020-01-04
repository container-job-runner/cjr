import * as Ajv from 'ajv'
import {docker_configuration_schema} from '../../../config/docker/schema/docker-configuration-schema'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const docker_run_schema = {
  "$id": "docker-run.json",
  "title": "Docker Run Configuration",
  "description": "Used internally by DockerRunDriver in run command",
  "type": "object",
  "properties": {
    "mounts": {"$ref": "docker-configuration-schema.json#/definitions/mounts"},
    "ports": {"$ref": "docker-configuration-schema.json#/definitions/ports"},
    "wd": {"type": "string"},
    "detached": {"type": "boolean"},
    "interactive": {"type": "boolean"},
    "remove": {"type": "boolean"},
    "name": {"type": "string"}
  }
}

// create new Ajv validator for docker_run_schema
var ajv = new Ajv({schemas: [docker_run_schema, docker_configuration_schema]})
export const dr_ajv_validator = ajv.getSchema(docker_run_schema["$id"])

//https://ajv.js.org
//https://www.jsonschemavalidator.net
//https://jsonschema.net
//https://json-schema.org/understanding-json-schema/structuring.html
