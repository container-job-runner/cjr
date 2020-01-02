import * as Ajv from 'ajv'

export const docker_job_schema = {
  "$id": "job-object.json",
  "title": "Configuration for a Docker Job",
  "description": "Used internally in DockerRunDriver to run jobs",
  "type": "object",
  "properties": {
    "command": {"type": "string"},
    "hostRoot": {
      "anyOf" : [
        {"type": "string"},
        {"type": "boolean"}
      ]
    },
    "containerRoot": {"type": "string"},
    "resultPaths": {
      "type": "array",
      "items": [
        {
          "type": "string"
        }
      ]
    },
    "synchronous": {"type": "boolean"},
    "removeOnExit": {"type": "boolean"},
    "name": {"type": "string"}
  },
  "required": [
    "command",
    "synchronous",
    "removeOnExit"
  ]
}

// Ajv validator for validating schema
var ajv = new Ajv({schemas: [docker_job_schema]})
export const dj_ajv_validator = ajv.getSchema(docker_job_schema["$id"])
