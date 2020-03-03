import * as fs from 'fs'
import * as path from 'path'
import {ValidatedOutput} from '../../../validated-output'
import {StackConfiguration} from '../abstract/stack-configuration'
import {dsc_vo_validator} from './schema/docker-stack-configuration-schema'
import {ajvValidatorToValidatedOutput} from '../../../functions/misc-functions'
import {DefaultContainerRoot} from '../../../constants'
import {FileTools} from '../../../fileio/file-tools'
import {PathTools} from '../../../fileio/path-tools'
import {JSTools} from '../../../js-tools'
import {YMLFile} from '../../../fileio/yml-file'
import {ErrorStrings, WarningStrings} from '../../../error-strings'

// Types
type Dictionary = {[key: string]: any}

export class DockerStackConfiguration extends StackConfiguration
{
  protected yml_file = new YMLFile("", false, dsc_vo_validator)
  protected valid_flag_fieldnames = ["network"] // only these fields will be read in from config.flags
  protected working_directory: string = ""
  protected command: string = ""
  protected synchronous: boolean = true
  protected remove_on_exit: boolean = false

  setRawObject(value: Dictionary, parent_path: string) {
    var result = super.setRawObject(value, parent_path)
    if(result.success) {
      if(parent_path) this.replaceRelativePaths(parent_path)
      this.validateBindMounts(result, parent_path)
    }
    return result
  }

  validate(raw_object: Dictionary)
  {
    return dsc_vo_validator(raw_object);
  }

  setCommand(value: string){
    this.command = value
  }

  setSyncronous(value: boolean){
    this.synchronous = value
  }

  setRemoveOnExit(value: boolean){
    this.remove_on_exit = value
  }

  setRsyncUploadSettings(value: {include: string, exclude: string}) {
    if(this.raw_object?.files == undefined) this.raw_object.files = {}
    if(this.raw_object?.files.rsync == undefined) this.raw_object.files.rsync = {}
    this.raw_object.files.rsync["upload-include-from"] = value.include
    this.raw_object.files.rsync["upload-exclude-from"] = value.exclude
  }

  setRsyncDownloadSettings(value: {include: string, exclude: string}) {
    if(this.raw_object?.files == undefined) this.raw_object.files = {}
    if(this.raw_object?.files.rsync == undefined) this.raw_object.files.rsync = {}
    this.raw_object.files.rsync["download-include-from"] = value.include
    this.raw_object.files.rsync["download-exclude-from"] = value.exclude
  }

  addBind(hostPath: string, containerPath: string, verify_host_path: boolean=true)
  {
      // verify host path Exists before adding
      if(verify_host_path && !fs.existsSync(hostPath)) return false
      if(!(this.raw_object?.mounts)) this.raw_object.mounts = [];
      this.raw_object.mounts.push({type: "bind", hostPath: hostPath, containerPath: containerPath})
      return true;
  }

  addVolume(volumeName: string, containerPath: string)
  {
      if(!(this.raw_object?.mounts)) this.raw_object.mounts = [];
      this.raw_object.mounts.push({type: "volume", volumeName: volumeName, containerPath: containerPath})
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

  addLabel(field: string, value: string) {
    if(!this.raw_object?.labels) this.raw_object.labels = {}
    this.raw_object.labels[field] = value
    return true;
  }

  addFlag(field: string, value: string) {
    if(!this.valid_flag_fieldnames.includes(field)) return false
    if(!this.raw_object?.flags) this.raw_object.flags = {}
    this.raw_object.flags[field] = value
    return true;
  }

  removeFlag(field: string) {
    if(!this.valid_flag_fieldnames.includes(field)) return false
    if(this.raw_object?.flags && (field in this.raw_object.flags)) delete this.raw_object.flags[field]
    return true
  }

  // access functions

  getCommand()
  {
    return this.command
  }

  getContainerRoot()
  {
    return this.raw_object?.files?.containerRoot || DefaultContainerRoot
  }

  getRsyncUploadSettings() {
    return {
      include: this.raw_object?.files?.rsync?.["upload-include-from"] || "",
      exclude: this.raw_object?.files?.rsync?.["upload-exclude-from"] || ""
    }
  }

  getRsyncDownloadSettings() {
    return {
      include: this.raw_object?.files?.rsync?.["download-include-from"] || "",
      exclude: this.raw_object?.files?.rsync?.["download-exclude-from"] || ""
    }
  }

  // output objects for run-drivers or build-drivers

  runObject()
  {
    var run_object:Dictionary = {}
    if(this.raw_object?.mounts) run_object.mounts = this.raw_object.mounts
    if(this.raw_object?.ports) run_object.ports = this.raw_object.ports
    if(this.raw_object?.environment) run_object.environment = this.raw_object.environment
    if(this.raw_object?.resources) run_object.resources = this.raw_object.resources
    if(this.raw_object?.flags) run_object.flags = this.raw_object.flags
    if(this.raw_object?.labels) run_object.labels = this.raw_object.labels
    if(this.working_directory) run_object.wd = this.working_directory
    run_object.command = this.command
    run_object.interactive = true // set all jobs to interactive so we can user docker attach
    run_object.detached = !this.synchronous
    run_object.remove = this.remove_on_exit
    return run_object
  }

  buildObject()
  {
      return this.raw_object?.build || {}
  }

  removeExternalBinds(parent_path: string)
  {
    // copy existing configuration
    const result = new ValidatedOutput(true);
    if(!this.raw_object?.mounts) return result

    this.raw_object.mounts = this.raw_object.mounts.filter((m:Dictionary) => {
        if(m.type === "bind") {
          const rel_path = PathTools.relativePathFromParent(
            PathTools.split(parent_path),
            PathTools.split(m.hostPath))
          if(rel_path) {
            m.hostPath = PathTools.join(rel_path) // make relative path
          }
          else {
            result.pushWarning(WarningStrings.BUNDLE.INVALID_STACK_BINDPATH(m.hostPath, parent_path));
            return false
          }
        }
        return true;
    })
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
      // -- replace all relative rsync files paths -----------------------------
      type rsync_field = "upload-exclude-from"|"upload-include-from"|"download-exclude-from"|"download-include-from"
      const rsync_object = this?.raw_object?.files?.rsync
      const rsyncfilepathToAbsolute = (field:rsync_field) => {
        const value = rsync_object?.[field]
        if(value && !path.isAbsolute(value))
          rsync_object[field] = path.join(parent_path, value)
      }
      rsyncfilepathToAbsolute("upload-exclude-from")
      rsyncfilepathToAbsolute("upload-include-from")
      rsyncfilepathToAbsolute("download-exclude-from")
      rsyncfilepathToAbsolute("download-include-from")
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
