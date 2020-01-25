import * as Ajv from 'ajv'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'

export const docker_configuration_schema = {
  "$id": "docker-configuration-schema.json",
  "title": "Docker Configuration Schema",
  "description": "Full Configuration Specification for a Docker Stack",
  "type": "object",
  "properties": {
    "version": {"$ref": "#/definitions/version"},
    "build": {"$ref": "#/definitions/build"},
    "mounts": {"$ref": "#/definitions/mounts"},
    "ports": {"$ref": "#/definitions/ports"},
    "environment": {"$ref": "#/definitions/args"},
    "resources": {"$ref": "#/definitions/resources"},
    "files": {"$ref": "#/definitions/files"},
    "flags": {"$ref": "#/definitions/flags"}
  },
  "additionalProperties": false,
  "definitions": {
    "version": {
        "type": "string",
        "pattern": "1"  // for general matching use: "^[0-9]+(\.[0-9]+)?$"
    },
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
    "resources": {
      "type": "object",
      "properties": {
        "cpu:": {
          "type": "string",
          "pattern": "^[0-9]+(\.[0-9]+)?$"
        },
        "gpu:": {
          "type": "string"
        },
        "memory": {
          "type" : "string",
          "pattern": "^[0-9]+(m|g)$"
        },
        "memory-swap": {
          "type" : "string",
          "pattern": "^[0-9]+(m|g)$"
        }
      },
      "dependencies": {
        "memory-swap": ["memory"]
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
    "flags" : {
      "type": "object"
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
    },
    "args": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    }
  }
}

// Ajv validator for validating schema
type Dictionary = {[key:string] : any}
const ajv = new Ajv({schemas: [docker_configuration_schema]})
export const dc_ajv_validator = ajv.getSchema(docker_configuration_schema["$id"])
export const dc_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(dc_ajv_validator, raw_object)
