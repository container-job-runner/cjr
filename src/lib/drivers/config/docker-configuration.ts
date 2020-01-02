
import * as fs from 'fs'
import {ValidatedOutput} from '../../validated-output'
import {Configuration} from './configuration'
import {dc_ajv_validator} from './docker-configuration-schema'
import {ajvValidatorToValidatedOutput} from '../../functions'

// Class for docker configuration
export class DockerConfiguration extends Configuration
{

  private working_directory

  validate(raw_object: object)
  {
    return ajvValidatorToValidatedOutput(dc_ajv_validator, raw_object);
  }

  getHostRoot(value: string)
  {
      return this.raw_object?.files?.hostRoot
  }

  getContainerRoot(value: string)
  {
      return this.raw_object?.files?.containerRoot
  }

  getResultPaths(value: string)
  {
      return this.raw_object?.files?.resultPaths
  }

  addBind(hostPath: string, containerPath: string, verify_host_path: boolean=true)
  {
      // verify host path Exists before adding
      const existsDir = path_str => fs.existsSync(path_str) && fs.lstatSync(path_str).isDirectory()
      if(verify_host_path && !existsDir(hostPath)) return false
      if(!(this.raw_object?.mounts)) this.raw_object.mounts = [];
      this.raw_object.mounts.push({type: "bind", hostPath: hostPath, containerPath: containerPath})
      return true;
  }

  addPort(hostPort: integer, containerPort: integer)
  {
      const validPort = (x) => (Number.isInteger(x) && x > 0)
      if(!validPort(hostPort) || !validPort(containerPort)) return false
      if(!(this.raw_object?.ports)) this.raw_object.ports = [];
      this.raw_object.ports.push({hostPort: hostPort, containerPort: containerPort})
      return true;
  }

  setWorkingDir(value: string)
  {
    this.working_directory = value
  }

  runObject()
  {
      var run_object = {}
      if(this.raw_object?.mounts) run_object.mounts = this.raw_object.mounts
      if(this.raw_object?.ports) run_object.ports = this.raw_object.ports
      if(this.working_directory) run_object.wd = this.working_directory
      return run_object
  }

  buildObject()
  {
      return this.raw_object?.build || {}
  }

}
