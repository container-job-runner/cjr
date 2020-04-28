import * as Ajv from 'ajv'
import {docker_stack_configuration_schema} from '../../../config/stacks/docker/schema/docker-stack-configuration-schema'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const podman_run_schema = {
  "$id": "podman-run.json",
  "title": "Podman Run Configuration",
  "description": "Used internally by DockerRunDriver in run command",
  "type": "object",
  "properties": {
    "command": {
      "type": "array",
      "items": {"type": "string"}
    },
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
    "flags": {"$ref": "#/definitions/extra-podman-flags"}
  },
  "definitions": {
      "extra-podman-flags" : {
        "type": "object",
        "properties": {
          "network" : {
            "type": "string",
            "pattern": "^(host)|(slirp4netns)$"
          },
          "userns" : {
            "type": "string",
            "pattern": "^(host)|(keep-id)$"
          },
          "security-opt" : {
            "type": "string",
            "pattern": "^(label=disable)$"
          }
        }
      }
  }
}

// create new Ajv validator for docker_run_schema
type Dictionary = {[key:string] : any}
var ajv = new Ajv({schemas: [podman_run_schema, docker_stack_configuration_schema]})
export const pr_ajv_validator = ajv.getSchema(podman_run_schema["$id"])
export const pr_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(pr_ajv_validator, raw_object)
