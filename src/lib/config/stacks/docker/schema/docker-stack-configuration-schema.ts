import * as Ajv from 'ajv'
import { ajvValidatorToValidatedOutput } from '../../../../functions/misc-functions'
import { Dictionary } from '../../../../constants'

export const docker_stack_configuration_schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "docker-configuration-schema.json",
  "title": "Docker Configuration Schema",
  "description": "Full Configuration Specification for a Docker Stack",
  "type": "object",
  "properties": {
    "version": {"$ref": "#/definitions/version"},
    "build": {"$ref": "#/definitions/build"},
    "entrypoint": {"$ref": "#/definitions/entrypoint"},
    "mounts": {"$ref": "#/definitions/mounts"},
    "ports": {"$ref": "#/definitions/ports"},
    "environment": {"$ref": "#/definitions/args"},
    "environment-dynamic": {"$ref": "#/definitions/args"},
    "resources": {"$ref": "#/definitions/resources"},
    "files": {"$ref": "#/definitions/files"},
    "snapshots": {
        "anyOf": [
            {"$ref": "#/definitions/remote-snapshots"},
            {"$ref": "#/definitions/archive-snapshots"}
        ],
    },
    "flags": {"$ref": "#/definitions/flags"}
  },
  "additionalProperties": false,
  "definitions": {
    "version": {
        "type": "string",
        "pattern": "1.0"  // for general matching use: "^[0-9]+(\.[0-9]+)?$"
    },
    "build": {
      "type": "object",
      "properties": {
        "image": {
          "type": "string"
        },
        "no-cache": {
          "type": "boolean"
        },
        "pull": {
          "type": "boolean"
        },
        "auth": {"$ref": "#/definitions/registry-auth"},
        "args": {"$ref": "#/definitions/args"},
        "args-dynamic": {"$ref": "#/definitions/args"}
      },
      "additionalProperties": false
    },
    "entrypoint": {
      "type": "array",
      "items": {
        "type": "string"
      },
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
            },
            "hostIp": {
              "type": "string"
            }
          },
          "required": [
            "hostPort",
            "containerPort"
          ],
          "additionalProperties": false
        }
      ]
    },
    "resources": {
      "type": "object",
      "properties": {
        "cpus": {
          "type": "string",
          "pattern": "^[0-9]+(\.[0-9]+)?$"
        },
        "gpu": {
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
      },
      "additionalProperties": false
    },
    "files": {
      "type": "object",
      "properties": {
        "containerRoot": {
          "type": "string"
        },
        "rsync": {
          "type": "object",
          "properties": {
            "upload-exclude-from" : {type: "string"},
            "upload-include-from" : {type: "string"},
            "download-exclude-from" : {type: "string"},
            "download-include-from" : {type: "string"},
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "remote-snapshots": {
       "type": "object",
       "properties": {
          "storage-location" : {
             "type": "string",
             "pattern": "^(registry)$"
           },
          "repository": {
              "type": "string"
          },  
          "mode" : {
             "type": "string",
             "pattern": "^(always)|(prompt)$"
           },
           "auth": {
               "$ref": "#/definitions/registry-auth"
           },
           "source": {
               "type": "string",
               "pattern": "^(dockerfile)|(container)"
           }
       },
       "required": [
          "storage-location", 
          "repository",
          "mode",
          "auth",
          "source"
        ],
       "additionalProperties": false
    },
    "archive-snapshots": {
       "type": "object",
       "properties": {
          "storage-location" : {
             "type": "string",
             "pattern": "^(archive)$"
           }, 
          "mode" : {
             "type": "string",
             "pattern": "^(always)|(prompt)$"
           },
           "source": {
               "type": "string",
               "pattern": "^(dockerfile)|(container)"
           }
       },
       "required": [
          "storage-location", 
          "mode",
          "source"
       ],
       "additionalProperties": false
    },
    "flags" : {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
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
        },
        "selinux": {
          "type": "boolean"
        },
        "remoteBehavior": {
          "type": "string",
          "pattern": "^(ignore)|(upload)|(preserve)$"
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
    },
    "registry-auth": {
      "type": "object",
      "properties": {
        "username": {
          "type": "string"
        },
        "server": {
          "type": "string"
        },
        "token": {
          "type": "string"
        }
       },
      "required": [
        "username",
        "server",
        "token"
      ],
      "additionalProperties": false
    }
  }
}

// Ajv validator for validating schema
const ajv = new Ajv({schemas: [docker_stack_configuration_schema]})
export const dsc_ajv_validator = ajv.getSchema(docker_stack_configuration_schema["$id"])
export const dsc_vo_validator  = (raw_object: Dictionary) => ajvValidatorToValidatedOutput(dsc_ajv_validator, raw_object)
