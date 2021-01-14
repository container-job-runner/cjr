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
import { SshShellCommand } from '../../../ssh-shell-command'

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
  "snapshots"?: DockerStackSnapshotOptions
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
  "remoteUpload"?: boolean
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

export type DockerRegistryAuthConfig = {
    "username": string
    "server": string
    "token": string
}

export type DockerStackBuildConfig = {
  "image"?: string
  "no-cache"?: boolean
  "pull"?: boolean
  "args"?: { [key:string] : string }
  "auth"?: DockerRegistryAuthConfig
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

export type DockerRegistryStackSnapshotOptions = {
    "storage-location": 'registry'
    "mode": 'always'|'prompt' 
    "auth": DockerRegistryAuthConfig
    "repository": string
}

export type DockerArchiveStackSnapshotOptions = {
    "storage-location": 'archive'
    "mode": 'always'|'prompt'
}

export type DockerStackSnapshotOptions = DockerRegistryStackSnapshotOptions | DockerArchiveStackSnapshotOptions

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

  stack_name = ""
  readonly config_filename = "config.yml" // name of config file in stack directory
  readonly archive_filename = "image" // name of config file in stack directory
  readonly build_context:string = "./build" // default build context relative to stack directory

  protected ERRORSTRINGS = {
    "MISSING_STACKDIR": (dir: string) => chalk`{bold Nonexistant Stack Directory.}\n  {italic path:} ${dir}`,
    "INVALID_NAME": (path: string) => chalk`{bold Invalid Stack Name} - stack names may contain only lowercase and uppercase letters, digits, underscores, periods and dashes.\n  {italic  path:} ${path}`,
    "INVALID_LOCAL_STACKDIR": (dir: string) => chalk`{bold Invalid Local Stack Directory} - {italic ${dir}} \n  Stack directory must contain at least one of the following: Dockerfile, config.yml, image.tar, or image.tar.gz.`,
    "YML_PARSE_ERROR": (path: string) => chalk`{bold Unable to Parse YML} - {italic ${path}}`,
    "NON_EXISTANT_BIND_HOSTPATH": (hostPath: string, cfile_path: string) => chalk`{bold Invalid Configuration} - bind mount contains nonexistant host path.\n     {italic configfile}: ${cfile_path}\n  {italic hostPath}: ${hostPath}`,
    "CONFIG_STACK_MISSING_IMAGE": (dir: string) => chalk`{bold Invalid Local Stack} - {italic ${dir}} \n  Stacks with no build directory must specify an image in config.yml`
  }

  constructor(options?: {tag?: string})
  {
    super()
    this.image_tag = options?.tag || cli_name
  }

  copy()
  {
    const copy = new DockerStackConfiguration({tag: this.image_tag})
    copy.config = JSTools.rCopy(this.config)
    copy.stack_path = this.stack_path
    copy.stack_type = this.stack_type
    copy.stack_name = this.stack_name
    return copy
  }

  // merges settings from configuration file into current stack configuration
  mergeConfigurations(config_paths: Array<string>, shell?:ShellCommand|SshShellCommand) : ValidatedOutput<undefined>
  {
    const merge = this.mergeConfigFiles(config_paths, shell)
    if(merge.success) JSTools.rMerge(this.config, merge.value)
    return new ValidatedOutput(true, undefined).absorb(merge)
  }

  // loads stack configuration and sets internal properties "name", and "stack_type"
  load(stack_path: string, overloaded_config_paths: Array<string>, shell?:ShellCommand|SshShellCommand) : ValidatedOutput<undefined>
  {
    const failure = new ValidatedOutput(false, undefined)
    const success = new ValidatedOutput(true, undefined)

    // -- identify stack and return if there are errors ----------------------
    const stk_type = this.identifyLocalStackType(stack_path)
    if(!stk_type.success)
      return failure.absorb(stk_type)

    // -- load configuration files -------------------------------------------
    const result = this.loadStackConfigFiles(stack_path, overloaded_config_paths, shell)
    if(!result.success)
      return failure.absorb(result)
    if(stk_type.value === 'config' && result.value?.build?.image === undefined)
      return failure.pushError(this.ERRORSTRINGS.CONFIG_STACK_MISSING_IMAGE(stack_path))

    // -- set stack properties -----------------------------------------------
    this.stack_type = stk_type.value
    this.config = result.value
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
      return failure.pushError(this.ERRORSTRINGS["MISSING_STACKDIR"](stack_path));

    if(!/^[a-zA-z0-9-_\.]+$/.test(this.stackPathToName(stack_path))) // exit if stack direcotry has invalid characters
      return failure.pushError(this.ERRORSTRINGS["INVALID_NAME"](stack_path))

    if(FileTools.existsFile(path.join(stack_path, this.build_context, 'Dockerfile')))
      return new ValidatedOutput(true, "dockerfile")
    else if(FileTools.existsFile(path.join(stack_path, this.build_context, `${this.archive_filename}.tar.gz`)))
      return new ValidatedOutput(true, "tar.gz")
    else if(FileTools.existsFile(path.join(stack_path, this.build_context, `${this.archive_filename}.tar`)))
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

  protected loadStackConfigFiles(stack_path: string, overloaded_config_paths: Array<string> = [], shell?: ShellCommand|SshShellCommand) : ValidatedOutput<DockerStackConfigObject>
  {
    const all_config_paths = []
    const primary_stack_config = path.join(stack_path, this.config_filename)
    if(fs.existsSync(primary_stack_config)) // stack config is optional so it may not exist
      all_config_paths.push(primary_stack_config)
    all_config_paths.push(...overloaded_config_paths)

    return this.mergeConfigFiles(all_config_paths, shell)
  }

  protected mergeConfigFiles(config_paths: Array<string>, shell?: ShellCommand | SshShellCommand) : ValidatedOutput<DockerStackConfigObject>
  {
    const config: DockerStackConfigObject = {}
    const result = new ValidatedOutput(true, config)
    
    config_paths.map( (path: string) => {
      const read_result = this.loadYMLFile(path, shell)
      if(read_result.success) JSTools.rMerge(config, read_result.value)
      result.absorb(read_result)
    })

    return result
  }

  // resolves fields build.[environment-dynamic] and run.[environment-dynamic]
  protected loadYMLFile(abs_path: string, shell?: ShellCommand | SshShellCommand) : ValidatedOutput<DockerStackConfigObject>
  {
    const failure = new ValidatedOutput(false, {});
    
    // read yml file
    const read_result = this.yml_file.read(abs_path)
    if(!read_result.success)
      return failure.absorb(read_result)
    
    // validate yml (allow blank files)
    const raw_yml_object = read_result.value || {}; // convert empty files to empty object
    if(!dsc_vo_validator(raw_yml_object).success)
      return failure.absorb(read_result)
      .pushError(this.ERRORSTRINGS.YML_PARSE_ERROR(abs_path))
     
    // resolve dynamic environment
    raw_yml_object.environment = this.processRawArgs(
      raw_yml_object?.environment,
      raw_yml_object?.["environment-dynamic"],
      shell
    )
    delete raw_yml_object["environment-dynamic"]
    // resolve build environment
    if(raw_yml_object?.build) {
      raw_yml_object.build.args = this.processRawArgs(
        raw_yml_object?.build?.args,
        raw_yml_object?.build?.["args-dynamic"],
        shell
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

  private processRawArgs(raw_env_data: any, raw_dynamic_env_data: any, shell?: ShellCommand | SshShellCommand) : { [key:string]: string }
  {
    const resolved_env:{ [key:string]: string } = {}

    if(raw_dynamic_env_data instanceof Object) // resolve dynamic properties
    Object.keys(raw_dynamic_env_data).map( (k:any) => {
      if(typeof k != "string")
        return
      const env_val = raw_dynamic_env_data[k]
      if(typeof env_val == "string")
        resolved_env[k] = this.evalDynamicArg(env_val, shell).value
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

  protected evalDynamicArg(value: string, shell?:ShellCommand|SshShellCommand)
  {
    const sh = shell || new ShellCommand(false, false)
    return trim(sh.output(`echo "${value}"`))
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
    this.stack_name = value.split(':').shift() || value;
    if(!this.config.build) this.config.build = {}
    this.config.build.image = value;
  }

  setTag(value: string){
    if(this.stack_type == "config" || this.stack_type == "remote-image")
    {
      const image = this.getImage()
      this.setImage(`${image.split(":").shift()}:${value}`)
    }
    else
      this.image_tag = value;
  }

  setEntrypoint(value: Array<string>){
    this.config.entrypoint = value
  }

  removeEntrypoint() {
      delete this.config.entrypoint
  }

  setContainerRoot(value: string) {
    if(this.config.files === undefined)
        this.config.files = {}
    this.config.files.containerRoot = value
  }

  setRsyncUploadSettings(value: {include: string|undefined, exclude: string|undefined}) {
    if(this.config?.files == undefined) this.config.files = {}
    if(this.config?.files.rsync == undefined) this.config.files.rsync = {}

    if(value.include) this.config.files.rsync["upload-include-from"] = value.include
    else delete this.config.files.rsync["upload-include-from"]

    if(value.exclude) this.config.files.rsync["upload-exclude-from"] = value.exclude
    else delete this.config.files.rsync["upload-exclude-from"]
  }

  setRsyncDownloadSettings(value: {include: string|undefined, exclude: string|undefined}) {
    if(this.config?.files == undefined) this.config.files = {}
    if(this.config?.files.rsync == undefined) this.config.files.rsync = {}

    if(value.include) this.config.files.rsync["download-include-from"] = value.include
    else delete this.config.files.rsync["download-include-from"]

    if(value.exclude) this.config.files.rsync["download-exclude-from"] = value.exclude
    else delete this.config.files.rsync["download-exclude-from"]
  }

  setSnapshotOptions(options: DockerStackSnapshotOptions)
  {
    this.config.snapshots = options;
  }

  setBuildAuth(auth: DockerRegistryAuthConfig)
  {
    if(!this.config?.build) this.config.build = {}
    this.config.build.auth = auth
  }

  removeBuildAuth()
  {
      delete this.config.build?.auth
      return true
  }

  // ---- mount modifiers -----------------------------------------------------

  addBind(hostPath: string, containerPath: string, options?: Dictionary)
  {
      // verify host path Exists before adding
      if(!options?.['allow-nonexistant'] && !fs.existsSync(hostPath)) return false
      if(!(this.config?.mounts)) this.config.mounts = [];
      this.config.mounts.push({
        ...{type: "bind", hostPath: hostPath, containerPath: containerPath},
        ...JSTools.oSubset(options || {}, ["consistency", "readonly", "selinux"])
      })
      return true;
  }

  addVolume(volumeName: string, containerPath: string, options?: Dictionary)
  {
      if(!(this.config?.mounts)) this.config.mounts = [];
      this.config.mounts.push({type: "volume", volumeName: volumeName, containerPath: containerPath, remoteUpload: options?.['remote-upload']})
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

  removeAllVolumes()
  {
    if(this.config?.mounts)
       this.config.mounts = this.config.mounts.filter(
           (m: DockerStackMountConfig) => (m.type != 'volume')
        )
    return new ValidatedOutput(true, undefined)
  }

  removeLocalVolumes()
  {
    if(this.config?.mounts)
       this.config.mounts = this.config.mounts.filter(
           (m: DockerStackMountConfig) => (m.type != 'volume') || ( (m.type === 'volume') && (m.remoteUpload === true) )
        )
    return new ValidatedOutput(true, undefined)
  }

  removeLocalBinds()
  {
    if(this.config?.mounts)
       this.config.mounts = this.config.mounts.filter(
           (m: DockerStackMountConfig) => (m.type != 'bind' || (m.remoteUpload === true))
        )
    return new ValidatedOutput(true, undefined)
  }

  mapPaths(map: {"stack-path": (p:string) => string, "bind-paths": (p:string) => string}): ValidatedOutput<undefined>
  {
    if(this.stack_path !== undefined)
        this.stack_path = map['stack-path'](this.stack_path)

    if(this.config?.mounts !== undefined) {
        this.config.mounts = this.config?.mounts?.map( 
            (m:DockerStackMountConfig) => {
                if(m.type == 'bind' && m.hostPath)
                    m.hostPath = map['bind-paths'](m.hostPath)
                return m
            }
        )
    }
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

  addEnvironmentVariable(name: string, value: string, dynamic?: boolean, shell?: ShellCommand|SshShellCommand)
  {
    if(this.config?.environment === undefined)
      this.config.environment = {}
    const result = (dynamic) ? this.evalDynamicArg(value, shell) : new ValidatedOutput<string>(true, value)
    this.config['environment'][name] = result.value
    return result.success;
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

  addBuildArg(name: string, value: string, dynamic?: boolean, shell?: ShellCommand|SshShellCommand)
  {
    if(!this.config?.build) this.config.build = {}
    if(!this.config?.build?.args) this.config.build.args = {}

    const result = (dynamic) ? this.evalDynamicArg(value, shell) : new ValidatedOutput<string>(true, value)
    this.config.build.args[name] = result.value
    return result.success;
  }

  removeBuildArg(name: string)
  {
    delete this.config?.build?.['args']?.[name]
    return true;
  }

  // ---- build flag modifiers -------------------------------------------------------

  addBuildFlag(field: string, value?: string)
  {
    if(!["no-cache", "pull"].includes(field))
      return false

    if(this.config.build == undefined)
      this.config.build = {}

    if(field == 'no-cache')
      this.config.build["no-cache"] = true
    else if(field == 'pull')
      this.config.build["pull"] = true
    return true
  }

  removeBuildFlag(field: string) {

    if(this.config.build == undefined)
      return true

    if(!["no-cache", "pull"].includes(field))
      return false

    if(field == 'no-cache')
      delete this.config.build['no-cache']
    else if(field == 'pull')
      delete this.config.build['pull']

    return true
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
    else 
    {
        const prefix = JSTools.md5(
            JSON.stringify(
                JSTools.oSubset(this.config?.build || {}, ["args", "image"]) // only use args and image fields for prefix
            )
        ).substring(0,5) // image prefix denotes build settings
        const path_hash = JSTools.md5(this.stack_path || "EMPTY") // image contains hash based on path
        return `${prefix}-${path_hash}-${this.stack_name}:${this.image_tag}`
    }
  }

  getBuildAuth(): DockerRegistryAuthConfig | undefined
  {
      return this.config?.build?.auth
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

  getFlag(key: string) {
    return this.config?.flags?.[key]
  }

  getBuildArg(key: string) {
    return this.config?.build?.args?.[key]
  }

  getEnvironmentVar(key: string) {
    return this.config?.environment?.[key]
  }

  getFlags() : { [key:string] : string }
  {
    return this.config?.flags || {}
  }

  getBuildArgs() : { [key:string] : string }
  {
    return this.config?.build?.args || {}
  }

  getEnvironmentVars() : { [key:string] : string }
  {
    return this.config?.environment || {}
  }

  getMounts() : Array<DockerStackMountConfig>
  {
    return this.config?.mounts || []
  }

  getPorts() : Array<DockerStackPortConfig> {
    return this.config?.ports || []
  }

  getSnapshotOptions(): undefined | DockerStackSnapshotOptions
  {
    return this.config?.snapshots
  }

  getBindMountPaths(remote_only: boolean) : Array<string>
  {
    if(!this.config?.mounts) return []
    
    const paths: Array<string> = []
    this.config.mounts.map( (m:DockerStackMountConfig) => {
        if(m.type === "bind" && m.hostPath && (!remote_only || m.remoteUpload))
            paths.push(m.hostPath)
    })

    return paths
  }

  getTag() : string
  {
      return this.getImage().split(':')?.[1] || "latest"
  }

}
