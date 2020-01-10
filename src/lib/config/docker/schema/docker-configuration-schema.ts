import * as Ajv from 'ajv'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const docker_configuration_schema = {
  "$id": "docker-configuration-schema.json",
  "title": "Full Configuration from a Docker-Based Stack",
  "description": "Docker Build",
  "type": "object",
  "properties": {
    "build": {"$ref": "#/definitions/build"},
    "mounts": {"$ref": "#/definitions/mounts"},
    "ports": {"$ref": "#/definitions/ports"},
    "files": {"$ref": "#/definitions/files"}
  },
  "definitions": {
    "build": {
      "type": "object",
      "properties": {
        "dockerfile": {
          "type": "string"
        },
        "context": {
          "type": "string"
        },
        "no-cache": {
          "type": "boolean"
        },
        "args": {"$ref": "#/definitions/args"}
      }
    },
    "args": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "files": {
      "type": "object",
      "properties": {
        "hostRoot": {
          "type": "string"
        },
        "containerRoot": {
          "type": "string"
        },
        "resultPaths": {
          "type": "array",
          "items": [
            {
              "type": "string"
            }
          ]
        }
      }
    },
    "mounts": {
      "type": "array",
      "items": {
        "anyOf" : [ {"$ref": "#/definitions/volume"}, {"$ref": "#/definitions/bind"}, {"$ref": "#/definitions/tmpfs"}]
      }
    },
    "ports": {
      "type": "array",
      "items": [
        {
          "type": "object",
          "properties": {
            "hostPort": {
              "type": "integer"
            },
            "containerPort": {
              "type": "integer"
            }
          },
          "required": [
            "hostPort",
            "containerPort"
          ]
        }
      ]
    },
    "volume": {
      "type": "object",
      "properties": {
        "volumeName": {
          "type": "string"
        },
        "containerPath": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "pattern": "^(volume)$"
        },
        "readonly": {
          "type": "boolean"
        }
      },
      "required": [
        "type",
        "containerPath",
        "volumeName"
      ]
    },
    "bind": {
      "type": "object",
      "properties": {
        "hostPath": {
          "type": "string"
        },
        "containerPath": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "pattern": "^(bind)$"
        },
        "consistency": {
          "type": "string",
          "pattern": "^(consistent)|(delegated)|(cached)$"
        },
        "readonly": {
          "type": "boolean"
        }
      },
      "required": [
        "type",
        "containerPath",
        "hostPath"
      ]
    },
    "tmpfs": {
      "type": "object",
      "properties": {
        "containerPath": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "pattern": "^(tmpfs)$"
        }
      },
      "required": [
        "type",
        "containerPath"
      ]
    }
  }
}

// Ajv validator for validating schema
const ajv = new Ajv({schemas: [docker_configuration_schema]})
export const dc_ajv_validator = ajv.getSchema(docker_configuration_schema["$id"])
export const dc_vo_validator  = (raw_object) => ajvValidatorToValidatedOutput(dc_ajv_validator, raw_object)
