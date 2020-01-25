import * as fs from 'fs'
import * as path from 'path'
import {ValidatedOutput} from '../../validated-output'
import {Configuration} from '../abstract/configuration'
import {dc_ajv_validator} from './schema/docker-configuration-schema'
import {ajvValidatorToValidatedOutput} from '../../functions/misc-functions'
import {FileTools} from '../../fileio/file-tools'
import {PathTools} from '../../fileio/path-tools'
import {JSTools} from '../../js-tools'
import {ErrorStrings, WarningStrings} from '../../error-strings'

// Types
type Dictionary = {[key: string]: any}

export class DockerConfiguration extends Configuration
{
  private valid_flag_fieldnames = ["network"] // only these fields will be read in from config.flags

  setRawObject(value: Dictionary, parent_path: string) {
    var result = super.setRawObject(value, parent_path)
    if(result.success) {
      if(parent_path) this.replaceRelativePaths(parent_path)
      this.validateBindMounts(result, parent_path)
    }
    return result
  }

  protected working_directory: string = ""

  validate(raw_object: Dictionary)
  {
    return ajvValidatorToValidatedOutput(dc_ajv_validator, raw_object);
  }

  getHostRoot()
  {
      return this.raw_object?.files?.hostRoot
  }

  getContainerRoot()
  {
      return this.raw_object?.files?.containerRoot
  }

  getResultPaths()
  {
      return this.raw_object?.files?.resultPaths
  }

  addBind(hostPath: string, containerPath: string, verify_host_path: boolean=true)
  {
      // verify host path Exists before adding
      if(verify_host_path && !FileTools.existsDir(hostPath)) return false
      if(!(this.raw_object?.mounts)) this.raw_object.mounts = [];
      this.raw_object.mounts.push({type: "bind", hostPath: hostPath, containerPath: containerPath})
      return true;
  }

  addPort(hostPort: number, containerPort: number)
  {
      const validPort = (x:number) => (Number.isInteger(x) && x > 0)
      if(!validPort(hostPort) || !validPort(containerPort)) return false
      if(!(this.raw_object?.ports)) this.raw_object.ports = [];
      this.raw_object.ports.push({hostPort: hostPort, containerPort: containerPort})
      return true;
  }

  addRunEnvironmentVariable(name: string, value: string)
  {
    if(!(this.raw_object?.environment)) this.raw_object.environment = {}
    this.raw_object.environment[name] = value
    return true;
  }

  setWorkingDir(value: string)
  {
    this.working_directory = value
  }

  // Set Any Additional Flags
  setFlag(field: string, value: string) {
    if(!this.valid_flag_fieldnames.includes(field)) return false
    if(!this.raw_object?.flags) this.raw_object.flags = {}
    this.raw_object.flags[field] = value
  }

  runObject()
  {
      var run_object:Dictionary = {}
      if(this.raw_object?.mounts) run_object.mounts = this.raw_object.mounts
      if(this.raw_object?.ports) run_object.ports = this.raw_object.ports
      if(this.raw_object?.environment) run_object.environment = this.raw_object.environment
      if(this.raw_object?.resources) run_object.resources = this.raw_object.resources
      if(this.raw_object?.flags) run_object.flags = this.raw_object.flags
      if(this.working_directory) run_object.wd = this.working_directory
      return run_object
  }

  buildObject()
  {
      return this.raw_object?.build || {}
  }

  bundle(stack_path: string)
  {
      // copy existing configuration
      const result = new ValidatedOutput(true);
      const raw_object = JSTools.rCopy(this.raw_object)
      result.data = raw_object;
      // remove any non local binds & warn about volumes
      if(raw_object?.mounts)
      {
          raw_object.mounts = raw_object.mounts.filter(
            (m:Dictionary) => {
              if(m.type === "tmpfs") return true
              if(m.type === "volume") {
                result.pushWarning(WarningStrings.BUNDLE.VOLUMEDATA(m.volumeName))
                return true;
              }
              if(m.type === "bind") {
                const rel_path = PathTools.relativePathFromParent(
                  PathTools.split(stack_path),
                  PathTools.split(m.hostPath))
                if(rel_path) {
                  m.hostPath = PathTools.join(rel_path) // make relative path
                }
                else {
                  result.pushWarning(WarningStrings.BUNDLE.INVALIDBINDPATH(m.hostPath));
                  return false
                }
              }
              return true;
            }
          )
      }
      return result
  }


  private replaceRelativePaths(parent_path: string)
  {
    if(parent_path)
    {
      // -- replace all relative bind mounts -----------------------------------
      this.raw_object?.mounts?.map(
        (mount:Dictionary) => {
          if(mount.type === "bind" && !path.isAbsolute(mount.hostPath)) {
            mount.hostPath = path.join(parent_path, mount.hostPath)
        }}
      )
      // -- replace hostRoot relative bind mounts ------------------------------
      const hostRoot = this.raw_object?.files?.hostRoot;
      if(hostRoot && !path.isAbsolute(hostRoot)) {
        this.raw_object.files.hostRoot = path.join(parent_path, hostRoot)
      }
    }
  }

  private validateBindMounts(result: ValidatedOutput, parent_path: string)
  {
    this.raw_object?.mounts?.map((b:Dictionary) => {
      if(b.type === "bind" && !FileTools.existsDir(b.hostPath))
        result.pushError(ErrorStrings.CONFIG.NON_EXISTANT_BIND_HOSTPATH(parent_path, b.hostPath))
    })
  }

}
