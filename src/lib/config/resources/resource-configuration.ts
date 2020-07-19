
import constants = require('../../constants')
import { JSTools } from '../../js-tools'
import { JSONFile } from '../../fileio/json-file'
import { rc_vo_validator } from './resource-configuration-schema'
import { Dictionary } from '../../constants'

export type ResourceType = "ssh"
export type Resource = {
  "type": ResourceType
  "address": string
  "username": string
  "key" ?: string
  "options": Dictionary
}

export type ResourceField = "type"|"address"|"username"|"key"

export class ResourceConfiguration
{
  private json_file: JSONFile
  private raw_object: {[key:string]: Resource} = constants.default_remote_config

  constructor(configuration_directory: string, auto_load:boolean=true)
  {
    this.json_file = new JSONFile(configuration_directory, true, rc_vo_validator)
    if(auto_load) this.loadFromFile()
  }

  loadFromFile()
  {
    const result = this.json_file.validatedRead(constants.remote_config_filename)
    if(result.success) this.raw_object = result.value
    return result
  }

  writeToFile()
  {
    return this.json_file.validatedWrite(constants.remote_config_filename, this.raw_object)
  }

  isResource(name: string)
  {
    return this.raw_object.hasOwnProperty(name)
  }

  getResource(name: string)
  {
    if(this.isResource(name))
      return (JSTools.rCopy(this.raw_object[name]) as Resource)
    return undefined
  }

  setResource(name: string, resource: Resource)
  {
    this.raw_object[name] = resource
  }

  deleteResource(name: string)
  {
    delete this.raw_object[name]
  }

  getAllResources()
  {
    return this.raw_object
  }

  numResources()
  {
    return Object.keys(this.raw_object).length
  }

}
