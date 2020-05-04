import * as fs from 'fs'
import * as path from 'path'
import { ValidatedOutput } from '../../../validated-output'
import { StackConfiguration } from '../abstract/stack-configuration'
import { dsc_vo_validator } from './schema/docker-stack-configuration-schema'
import { trim } from '../../../functions/misc-functions'
import { DefaultContainerRoot, cli_name, Dictionary } from '../../../constants'
import { FileTools } from '../../../fileio/file-tools'
import { PathTools } from '../../../fileio/path-tools'
import { JSTools } from '../../../js-tools'
import { YMLFile } from '../../../fileio/yml-file'
import { ErrorStrings, WarningStrings } from '../../../error-strings'
import { ShellCommand } from '../../../shell-command'
import chalk = require('chalk')

// === START Config types =========================================================

export type DockerStackConfigObject = {
  "version"?: string
  "build"?: DockerStackBuildConfig
  "mounts"?: Array<DockerStackMountConfig>
  "ports"?: Array<DockerStackPortConfig>
  "environment"?: { [key:string] : string }
  "resources"?: DockerStackResourceConfig
  "files"?: DockerStackFileConfig
  "entrypoint"?: Array<string>
  "flags"?: { [key:string] : string }
}

export type DockerStackMountConfig = {
  "type": "volume"|"bind"|"tmpfs"
  "hostPath"?: string
  "volumeName"?: string
  "containerPath": string
  "readonly"?: boolean
  "consistency"?: "consistent" | "cached" | "delegated"
  "selinux"?: boolean
}

export type DockerStackPortConfig = {
  "containerPort": number
  "hostPort": number
  "hostIp"?: string
}

export type DockerStackResourceConfig = {
  "gpu"?: string
  "cpus"?: string
  "memory"?: string
  "memory-swap"?: string
}

export type DockerStackBuildConfig = {
  "image"?: string
  "no-cache"?: boolean
  "pull"?: boolean
  "args"?: { [key:string] : string }
}

export type DockerStackFileConfig = {
  "containerRoot"?: string
  "rsync"?: {
    "upload-exclude-from"?: string
    "upload-include-from"?: string
    "download-exclude-from"?: string
    "download-include-from"?: string
  }
}

export type StackType = "remote-image"|"tar"|"tar.gz"|"dockerfile"|"config"
// remote: no local stack folder, only a remote image is specified
// tar.gz: stack folder exists and contains file "image.tar.gz"
// tar: stack folder exists and contains file "image.tar"
// dockerfile: stack folder exists, and contains a Dockerfile and an optional "config.yml"
// config: stack folder exists, and contains only a "config.yml"

// === END Config types ===========================================================

export class DockerStackConfiguration extends StackConfiguration<DockerStackConfigObject>
{
  config: DockerStackConfigObject = {} // contains raw stack configuration data
  stack_type: StackType|undefined = undefined // identifies which stack this is (remote, dockerfile, tar)
  image_tag: string = "" // tag used for image building
  yml_file = new YMLFile("", false, dsc_vo_validator) // yml file for reading configs

  protected stack_name = ""
  readonly config_filename = "config.yml" // name of config file in stack directory
  readonly archive_filename = "image" // name of config file in stack directory
  readonly build_context:string = "./build" // default build context relative to stack directory
  protected verify_host_bind_path:boolean = true;

  protected ERRORSTRINGS = {
    "MISSING_STACKDIR": (dir: string) => chalk`{bold Nonexistant Stack Directory or Image.}\n  {italic path:} ${dir}`,
    "INVALID_NAME": (path: string) => chalk`{bold Invalid Stack Name} - stack names may contain only lowercase and uppercase letters, digits, underscores, periods and dashes.\n  {italic  path:} ${path}`,
    "INVALID_LOCAL_STACKDIR": (dir: string) => chalk`{bold Invalid Local Stack Directory} - {italic ${dir}} \n  Stack directory must contain at least one of the following: Dockerfile, config.yml, image.tar, or image.tar.gz.`,
    "YML_PARSE_ERROR": (path: string) => chalk`{bold Unable to Parse YML} - {italic ${path}}`,
    "NON_EXISTANT_BIND_HOSTPATH": (hostPath: string, cfile_path: string) => chalk`{bold Invalid Configuration} - bind mount contains nonexistant host path.\n     {italic configfile}: ${cfile_path}\n  {italic hostPath}: ${hostPath}`
  }

  constructor(image_tag?: string)
  {
    super()
    this.image_tag = image_tag || cli_name
  }

  // loads stack configuration and sets internal properties "name", and "stack_type"
  load(stack_path: string, overloaded_config_paths: Array<string>) : ValidatedOutput<undefined>
  {
    const failure = new ValidatedOutput(false, undefined)
    const success = new ValidatedOutput(true, undefined)

    // -- identify stack and return if there are errors ----------------------
    const stk_type = this.identifyLocalStackType(stack_path)
    if(!stk_type.success)
      return failure.absorb(stk_type)
    this.stack_type = stk_type.value

    // -- load configuration files -------------------------------------------
    const result = this.loadStackConfigFiles(stack_path, overloaded_config_paths)
    if(!result.success) return failure.absorb(result)
    this.config = result.value

    // -- set additional properties ------------------------------------------
    this.stack_name = this.stackPathToName(stack_path)
    this.stack_path = stack_path

    return success
  }

  // == START Helper functions for load() ==========================================

  // checks stack_path for necessary files and returns stack type
  protected identifyLocalStackType(stack_path: string) : ValidatedOutput<StackType>
  {
    const failure = new ValidatedOutput<StackType>(false, "remote-image")

    if(!FileTools.existsDir(stack_path)) // exit with failure if stack does not exist
      return failure;

    if(!/^[a-zA-z0-9-_]+$/.test(this.stackPathToName(stack_path))) // exit if stack direcotry has invalid characters
      return failure.pushError(this.ERRORSTRINGS["INVALID_NAME"](stack_path))

    if(FileTools.existsFile(path.join(stack_path, this.build_context, 'Dockerfile')))
      return new ValidatedOutput(true, "dockerfile")
    else if(FileTools.existsFile(path.join(stack_path, `${this.archive_filename}.tar.gz`)))
      return new ValidatedOutput(true, "tar.gz")
    else if(FileTools.existsFile(path.join(stack_path, `${this.archive_filename}.tar`)))
      return new ValidatedOutput(true, "tar")
    else if(FileTools.existsFile(path.join(stack_path, this.config_filename)))
      return new ValidatedOutput(true, "config")
    else
      return failure.pushError(this.ERRORSTRINGS["INVALID_LOCAL_STACKDIR"](stack_path));
  }

  // returns name of stack based on stack_path
  protected stackPathToName(stack_path: string) : string
  {
    return path.basename(stack_path).toLowerCase()
  }

  protected loadStackConfigFiles(stack_path: string, overloaded_config_paths: Array<string> = []) : ValidatedOutput<DockerStackConfigObject>
  {
    const config: DockerStackConfigObject = {}
    const result = new ValidatedOutput(true, config)

    const stack_config = path.join(stack_path, this.config_filename)
    const all_config_paths = [stack_config].concat(overloaded_config_paths) // Note: create new array with = to prevent modifying overloaded_config_paths for calling function

    all_config_paths.map( (path: string) => {
      const read_result = this.loadYMLFile(path)
      if(read_result.success) JSTools.rMerge(config, read_result.value)
      result.absorb(read_result)
    })

    return result
  }

  // resolves fields build.[environment-dynamic] and run.[environment-dynamic]
  protected loadYMLFile(abs_path: string) : ValidatedOutput<DockerStackConfigObject>
  {
    const read_result = this.yml_file.validatedRead(abs_path) // json Schema used to validate object
    if(!read_result.success)
      return new ValidatedOutput(false, {})
        .pushError(this.ERRORSTRINGS.YML_PARSE_ERROR(abs_path))
        .absorb(read_result)

    const raw_yml_object = read_result.value
    // resolve dynamic environment
    raw_yml_object.environment = this.processRawArgs(
      raw_yml_object?.environment,
      raw_yml_object?.["environment-dynamic"]
    )
    delete raw_yml_object["environment-dynamic"]
    // resolve build environment
    if(raw_yml_object?.build) {
      raw_yml_object.build.args = this.processRawArgs(
        raw_yml_object?.build?.args,
        raw_yml_object?.build?.["args-dynamic"]
      )
      delete (raw_yml_object?.build || {})["args-dynamic"] // Note: optional chaining (?.) not used due to https://github.com/microsoft/TypeScript/pull/35090
    }

    // -- replace relative paths for binds and rsync files
    this.replaceRelativePaths(raw_yml_object, path.dirname(abs_path))
    const result = new ValidatedOutput(true, raw_yml_object)
    // -- validate mounts -----
    if(this.validateBindMounts)
      result.absorb(this.validateBindMounts(raw_yml_object, abs_path))
    return result
  }

  private processRawArgs(raw_env_data: any, raw_dynamic_env_data: any) : { [key:string]: string }
  {
    const resolved_env:{ [key:string]: string } = {}

    if(raw_dynamic_env_data instanceof Object) // resolve dynamic properties
    Object.keys(raw_dynamic_env_data).map( (k:any) => {
      if(typeof k != "string")
        return
      const env_val = raw_dynamic_env_data[k]
      if(typeof env_val == "string")
        resolved_env[k] = this.evalDynamicArg(env_val)
    })

    if(raw_env_data instanceof Object) // resolve static properties
      Object.keys(raw_env_data).map( (k:any) => {
      if(typeof k != "string")
        return
      const env_val = raw_env_data[k]
      if(typeof env_val == "string")
        resolved_env[k] = env_val
    })

    return resolved_env
  }

  protected evalDynamicArg(value: string)
  {
    return trim(new ShellCommand(false, false).output(`echo "${value}"`)).value
  }

    private replaceRelativePaths(config: DockerStackConfigObject, parent_path: string)
  {
    if(!parent_path) return
    const toAbsolute = (p: string|undefined) => (p && !path.isAbsolute(p)) ? path.join(parent_path, p) : p

    // -- replace all relative bind mounts -----------------------------------
    config?.mounts?.map(
      (mount:Dictionary) => {
        if(mount.type === "bind") {
          mount.hostPath = toAbsolute(mount.hostPath)
      }}
    )

    // -- replace all relative rsync files paths -----------------------------
    type rsync_field = "upload-exclude-from"|"upload-include-from"|"download-exclude-from"|"download-include-from"
    (Object.keys(config?.files?.rsync || {}) as Array<rsync_field>).map((k:rsync_field) => {
      if(config?.files?.rsync?.[k])
        config.files.rsync[k] = toAbsolute(config.files.rsync[k])
    })
  }

  private validateBindMounts(config: DockerStackConfigObject, configfile_path: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    config?.mounts?.map((m:DockerStackMountConfig) => {
      if(m.type === "bind" &&  m?.hostPath && !fs.existsSync(m.hostPath))
        result.pushError(ErrorStrings.CONFIG.NON_EXISTANT_BIND_HOSTPATH(m.hostPath, configfile_path))
    })
    return result
  }

  // == END Helper functions for load() ==========================================


  // accepts option: "name": string which changes name of config file
  save(stack_path: string, options?: Dictionary) : ValidatedOutput<undefined> | ValidatedOutput<Error>
  {
    if(!FileTools.existsDir(stack_path))
      return new ValidatedOutput(false, undefined)

    return this.yml_file.validatedWrite(
      path.join(
        stack_path,
        options?.name || this.config_filename
      ),
      this.config
    )
  }

  // == modifiers ==============================================================

  setImage(value: string){
    this.stack_type = "remote-image"
    this.stack_path = undefined // clear stack_path if image is manually set
    this.stack_name = value.split(':').pop() || value;
    if(!this.config.build) this.config.build = {}
    this.config.build.image = value;
  }

  setEntrypoint(value: Array<string>){
    this.config.entrypoint = value
  }

  setRsyncUploadSettings(value: {include: string, exclude: string}) {
    if(this.config?.files == undefined) this.config.files = {}
    if(this.config?.files.rsync == undefined) this.config.files.rsync = {}

    if(value.include) this.config.files.rsync["upload-include-from"] = value.include
    else delete this.config.files.rsync["upload-include-from"]

    if(value.exclude) this.config.files.rsync["upload-exclude-from"] = value.exclude
    else delete this.config.files.rsync["upload-exclude-from"]
  }

  setRsyncDownloadSettings(value: {include: string, exclude: string}) {
    if(this.config?.files == undefined) this.config.files = {}
    if(this.config?.files.rsync == undefined) this.config.files.rsync = {}

    if(value.include) this.config.files.rsync["download-include-from"] = value.include
    else delete this.config.files.rsync["download-include-from"]

    if(value.exclude) this.config.files.rsync["download-exclude-from"] = value.exclude
    else delete this.config.files.rsync["download-exclude-from"]
  }

  // ---- mount modifiers -----------------------------------------------------

  addBind(hostPath: string, containerPath: string, options?: Dictionary)
  {
      // verify host path Exists before adding
      if(this.verify_host_bind_path && !fs.existsSync(hostPath)) return false
      if(!(this.config?.mounts)) this.config.mounts = [];
      this.config.mounts.push({
        ...{type: "bind", hostPath: hostPath, containerPath: containerPath},
        ...JSTools.oSubset(options || {}, ["consistency", "readonly", "selinux"])
      })
      return true;
  }

  addVolume(volumeName: string, containerPath: string)
  {
      if(!(this.config?.mounts)) this.config.mounts = [];
      this.config.mounts.push({type: "volume", volumeName: volumeName, containerPath: containerPath})
      return true;
  }

  removeBind(hostPath: string)
  {
    if(this.config?.mounts !== undefined)
      this.config.mounts = this.config?.mounts?.filter((m: Dictionary) => !(m?.type == 'bind' && m?.hostPath == hostPath))
    return new ValidatedOutput(true, undefined)
  }

  removeVolume(volumeName: string)
  {
    if(this.config?.mounts !== undefined)
      this.config.mounts = this.config?.mounts?.filter((m: Dictionary) => !(m?.type == 'volume' && m?.volumeName == volumeName))
    return new ValidatedOutput(true, undefined)
  }

  removeExternalBinds(parent_path: string)
  {
    // copy existing configuration
    const result = new ValidatedOutput<undefined>(true, undefined);
    if(!this.config?.mounts) return result

    this.config.mounts = this.config.mounts.filter((m:Dictionary) => {
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

  // ---- resource modifiers ---------------------------------------------------

  setCpu(value: number) {
    if(this.config?.resources === undefined)
      this.config.resources = {}
    this.config.resources['cpus'] = `${value}`
  }

  setMemory(value: number, units:"GB"|"MB"|"KB"|"B") {
    if(this.config?.resources === undefined)
      this.config.resources = {}
    if(units === "GB")
      this.config.resources['memory'] = `${value}g`
    if(units === "MB")
      this.config.resources['memory'] = `${value}m`
    if(units === "KB")
      this.config.resources['memory'] = `${value}k`
    else
      this.config.resources['memory'] = `${value}b`
  }

  setSwapMemory(value: number, units:"GB"|"MB"|"KB"|"B") {
    if(this.config?.resources === undefined)
      this.config.resources = {}
    if(units === "GB")
      this.config.resources['memory-swap'] = `${value}g`
    if(units === "MB")
      this.config.resources['memory-swap'] = `${value}m`
    if(units === "KB")
      this.config.resources['memory-swap'] = `${value}k`
    else
      this.config.resources['memory-swap'] = `${value}b`
  }

  // ---- port modifiers -------------------------------------------------------

  addPort(hostPort: number, containerPort: number, address?: string)
  {
      const validPort = (x:number) => (Number.isInteger(x) && x > 0)
      if(!validPort(hostPort) || !validPort(containerPort)) return false
      if(!(this.config?.ports)) this.config.ports = [];
      const port_spec:DockerStackPortConfig = {hostPort: hostPort, containerPort: containerPort}
      if(address !== undefined) port_spec['hostIp'] = address
      this.config.ports.push(port_spec)
      return true;
  }

  removePort(hostPort: number)
  {
    if(this.config?.ports !== undefined)
      this.config.ports = this.config?.ports?.filter((p: Dictionary) => !(p?.hostPort == hostPort))
    return new ValidatedOutput(true, undefined)
  }

  // ---- environment variables ------------------------------------------------

  addEnvironmentVariable(name: string, value: string, dynamic?: boolean)
  {
    if(this.config?.environment === undefined)
      this.config.environment = {}
    this.config['environment'][name] = (dynamic) ? this.evalDynamicArg(value) : value
    return true;
  }

  removeEnvironmentVariable(name: string)
  {
    delete (this.config['environment'] || {})[name] // Note: optional chaining (?.) not used due to https://github.com/microsoft/TypeScript/pull/35090
    return true;
  }

  // ---- flag modifiers -------------------------------------------------------

  addFlag(field: string, value: string) {
    if(!this.config?.flags) this.config.flags = {}
    this.config.flags[field] = value
    return true;
  }

  removeFlag(field: string) {
    if(this.config?.flags && (field in this.config.flags)) delete this.config.flags[field]
    return true
  }

  // ---- build args -----------------------------------------------------------

  addBuildArg(name: string, value: string, dynamic?: boolean)
  {
    if(!this.config?.build) this.config.build = {}
    if(!this.config?.build?.args) this.config.build.args = {}

    this.config.build.args[name] = (dynamic) ? this.evalDynamicArg(value) : value
    return true;
  }

  removeBuildArg(name: string)
  {
    delete this.config?.build?.['args']?.[name]
    return true;
  }

  // == Access Functions =======================================================

  getName(): string
  {
    return this.stack_name
  }

  getImage(): string
  {
    if(this.stack_type == 'config' || this.stack_type == 'remote-image')
      return this.config?.build?.image || ""
    else {
      const prefix = JSTools.md5(JSON.stringify(this.config?.build || {})).substring(0,5) // image prefix denotes build settings
      const path_hash = JSTools.md5(this.stack_path || "EMPTY") // image contains hash based on path
      return `${prefix}-${path_hash}-${this.stack_name}:${this.image_tag}`
    }
  }

  getEntrypoint() : Array<string> | undefined
  {
    return this.config?.entrypoint
  }

  getContainerRoot()
  {
    return this.config?.files?.containerRoot || DefaultContainerRoot
  }

  getRsyncUploadSettings(filter_nonexisting: boolean)
  {
    const upload_settings = {
      include: this.config?.files?.rsync?.["upload-include-from"] || "",
      exclude: this.config?.files?.rsync?.["upload-exclude-from"] || ""
    }
    if(!filter_nonexisting) return upload_settings;
    // set nonexisting paths to empty string
    type K = keyof typeof upload_settings;
    (Object.keys(upload_settings) as Array<K>).map(
      (key:K) => {
        if(!FileTools.existsFile(upload_settings[key]))
          upload_settings[key] = ""
      })
    return upload_settings
  }

  getRsyncDownloadSettings(filter_nonexisting: boolean) {
    const download_settings = {
      include: this.config?.files?.rsync?.["download-include-from"] || "",
      exclude: this.config?.files?.rsync?.["download-exclude-from"] || ""
    }
    if(!filter_nonexisting) return download_settings;
    // set nonexisting paths to empty string
    type K = keyof typeof download_settings;
    (Object.keys(download_settings) as Array<K>).map(
      (key:K) => {
        if(!FileTools.existsFile(download_settings[key]))
          download_settings[key] = ""
      })
    return download_settings
  }

  getFlags() {
    return this.config?.flags || {}
  }

}
