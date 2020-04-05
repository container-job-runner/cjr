import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as inquirer from 'inquirer'
import * as chalk from 'chalk'
import {RunDriver} from '../drivers/abstract/run-driver'
import {BuildDriver} from '../drivers/abstract/build-driver'
import {StackConfiguration} from '../config/stacks/abstract/stack-configuration'
import {PathTools} from '../fileio/path-tools'
import {FileTools} from '../fileio/file-tools'
import {JSONFile} from '../fileio/json-file'
import {YMLFile} from '../fileio/yml-file'
import {ValidatedOutput} from '../validated-output'
import {printResultState} from './misc-functions'
import {ShellCommand} from '../shell-command'
import {DefaultContainerRoot, X11_POSIX_BIND, project_idfile, projectSettingsDirPath, projectSettingsYMLPath, job_info_label, rsync_constants, file_volume_label, project_settings_file, stack_bundle_rsync_file_paths} from '../constants'
import {buildAndLoad} from '../functions/build-functions'
import {ErrorStrings, WarningStrings, StatusStrings} from '../error-strings'
import {PodmanStackConfiguration} from '../config/stacks/podman/podman-stack-configuration'
import {JSTools} from '../js-tools'
import {ProjectSettings} from '../config/project-settings/project-settings'

// == TYPES ====================================================================

export type Dictionary = {[key: string]: any}

// -- options for core function startJob ---------------------------------------
export type port   = {hostPort:number, containerPort: number}
export type label  = {key:string, value: string}
export type ports  = Array<port>
export type labels = Array<label>
export type buildmodes = "no-rebuild"|"build"|"build-nocache"

export type JobOptions = {
    "stack-path": string,                                                       // stack that should be used to run job
    "config-files": Array<string>,                                              // any additional configuration files for stack
    "build-mode": buildmodes,                                                   // specifies how to build stack before run
    "command": string,                                                          // command for job
    "entrypoint"?: string,                                                      // optional entrypoint override
    "host-root"?: string,                                                       // project host root
    "file-access": "volume"|"bind",                                             // specifies how project files are accessed by container
    "file-volume-id"?: string,                                                  // if this field is specified, this volume will be mounted at container Root (instead of a new volume being created)
    "synchronous": boolean,                                                     // specifies whether job is run sync or async
    "x11"?: boolean,                                                            // if true binds x11 dirs and passes xauth info to container
    "ports"?: ports,                                                            // specfies ports that should be bound for job
    "environment"?: Dictionary,
    "labels"?: labels,                                                          // specifies labels for job
    "cwd": string                                                               // current directory where user called cli (normally should be process.cwd())
    "remove": boolean,                                                          // if true job should be discarded once it completes
}

// -- options for core function copyJob ----------------------------------------
export type CopyOptions = {
  ids: Array<string>,                                                           // job ids that should be copied
  "stack-paths"?: Array<string>,                                                // only copy jobs that pertain to this stack
  mode:"update"|"overwrite"|"mirror",                                           // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  verbose:boolean,                                                              // if true rsync will by run with -v flag
  "host-path"?:string,                                                          // location where files should be copied. if specified this setting overrides job hostDir
  manual?:boolean,                                                              // manually copy - runs terminal instead of rsync command
  force?:boolean                                                                // used by remote for copying into project directories that differ from project directory that was used to start job
}

export type ContainerRuntime = {
  runner: RunDriver,
  builder: BuildDriver
}

export type OutputOptions = {
  verbose: boolean,
  explicit: boolean,
  silent: boolean
}

// -- used by functions jobCopy and syncHostDirAndVolume
export type RsyncOptions = {
  "host-path": string,                                                          // path on host where files should be copied to
  volume: string,                                                               // id of volume that contains files
  direction: "to-volume"|"to-host",                                             // specifies direction of sync
  mode: "update"|"overwrite"|"mirror",                                          // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  verbose?: boolean,                                                            // if true rsync will by run with -v flag
  files?: {include: string, exclude: string},                                   //rsync include-from and rsync exclude-from
  chown?: string                                                                //string that specifies the username or id to use with command chown
}

// -- used by function bundleProject and bundleProjectSettings
export type ProjectBundleOptions =
{
  "project-root": string,
  "stack-path":   string,
  "config-files": Array<string>,
  "bundle-path":  string
  "stacks-dir"?:  string,
  "build-mode"?:  "no-rebuild"|"build"|"build-nocache"|"no-build",
  "verbose"?:     boolean
}

// -- used by function bundleStack
export type StackBundleOptions =
{
  "stack-path":           string              // absolute path to stack that should be bundled
  "config-files":         Array<string>,
  "bundle-path":          string,
  "config-files-only"?:   boolean, // if selected only configuration files are bundled
  "build-mode"?:          "no-rebuild"|"build"|"build-nocache"|"no-build",
  "verbose"?:             boolean
}

// == CORE FUNCTIONS ===========================================================

// -----------------------------------------------------------------------------
// STARTJOB starts a new job.
// -- Parameters ---------------------------------------------------------------
// container_runtime: ContainerRuntime - runner and builder for job
// job_options: JobOptions
// output_options: OutputOptions
// -----------------------------------------------------------------------------
export function jobStart(container_runtime: ContainerRuntime, job_options: JobOptions, output_options: OutputOptions={verbose: false, explicit: false, silent: false})
{
  // -- 1. build stack and load stack configuration ----------------------------
  printStatusHeader(StatusStrings.JOBSTART.BUILD, output_options)
  var result = buildAndLoad(
    container_runtime.builder,
    job_options["build-mode"],
    job_options["stack-path"],
    job_options["config-files"]
  )
  if(!result.success) return result
  const configuration:StackConfiguration = result.data
  // -- 2.1 update configuration: mount Files ----------------------------------
  if(job_options["host-root"] && job_options["file-access"] === "bind")
    bindHostRoot(configuration, job_options["host-root"])
  else if(job_options["host-root"] && job_options["file-access"] === "volume" && job_options?.["file-volume-id"])
    mountFileVolume(configuration, job_options["host-root"], job_options["file-volume-id"])
  else if(job_options["host-root"] && job_options["file-access"] === "volume") {
    printStatusHeader(StatusStrings.JOBSTART.VOLUMECOPY, output_options)
    result = createAndMountFileVolume(container_runtime, configuration, job_options["host-root"], output_options.verbose)
    if(!result.success) return result
  }
  setRelativeWorkDir(configuration, job_options["host-root"] || "", job_options["cwd"])

  // -- 2.2 update configuration: apply options --------------------------------
  if(job_options?.ports)
    job_options["ports"].map((p:{hostPort:number, containerPort: number}) =>
      configuration.addPort(p.hostPort, p.containerPort))
  if(job_options?.x11) enableX11(configuration, output_options.explicit)
  if(job_options?.environment) Object.keys(job_options['environment']).map((key:string) =>
    configuration.addRunEnvironmentVariable(key, job_options['environment']?.[key] || "")
  )
  if(job_options?.labels) job_options["labels"].map(
    (flag:{key:string, value: string}) => configuration.addLabel(flag.key, flag.value)
  )
  if(job_options?.entrypoint) configuration.setEntrypoint(job_options.entrypoint)
  configuration.setCommand((job_options["x11"]) ? prependXAuth(job_options["command"], output_options.explicit) : job_options["command"])
  configuration.setSyncronous(job_options["synchronous"])
  configuration.setRemoveOnExit(job_options["remove"])
  addGenericLabels(configuration, job_options["host-root"] || "", job_options["stack-path"])
  // -- 3. start job -----------------------------------------------------------
  printStatusHeader(StatusStrings.JOBSTART.START, output_options)
  var job_id = ""
  var result = container_runtime.runner.jobStart(job_options["stack-path"], configuration, {postCreate: (id:string) => {job_id = id}})
  // -- print id ---------------------------------------------------------------
  printStatusHeader(StatusStrings.JOBSTART.JOB_ID, output_options)
  if(output_options.verbose) console.log(job_id)
  if(job_id === "") return new ValidatedOutput(false, [], [ErrorStrings.JOBS.FAILED_START])
  else return new ValidatedOutput(true, job_id)
}

// helper function user by startjob to print status
function printStatusHeader(message: string, output_options: OutputOptions, line_width:number = 70) {
  if(output_options.verbose) console.log(chalk`-- {bold ${message}} ${'-'.repeat(Math.max(0,line_width - message.length - 4))}`)
}

// -----------------------------------------------------------------------------
// COPYJOB copies files associated with a job back to the host.
// -- Parameters ---------------------------------------------------------------
// ids:Array<string> - ids of jobs that should copied
// stack_path:string - absolite path of project root folder
// container_runtime:ContainerRuntime -
// options: CopyOptions
// -----------------------------------------------------------------------------
export function jobCopy(container_runtime: ContainerRuntime, copy_options: CopyOptions)
{
  // -- get information on all matching jobs -----------------------------------
  var result = matchingJobInfo(container_runtime.runner, copy_options["ids"], copy_options["stack-paths"] || [""])
  if(!result.success) return result
  const job_info_array = result.data
  // -- copy results from all matching jobs ------------------------------------
  job_info_array.map((job:Dictionary) => {
    // -- 1. extract label information -----------------------------------------
    const id = job.id;
    const hostRoot = job?.labels?.hostRoot || ""
    const file_volume_id = job?.labels?.[file_volume_label] || ""
    const stack_path = job?.labels?.stack || ""
    const host_path  = copy_options?.["host-path"] || hostRoot // set copy-path to job hostRoot if it's not specified
    if(!hostRoot) return result.pushWarning(WarningStrings.JOBCOPY.NO_HOSTROOT(id))
    if(!file_volume_id) return result.pushWarning(WarningStrings.JOBCOPY.NO_VOLUME(id))
    // -- 2. load stack configuration & get download settings ------------------
    const ps_object = loadProjectSettings(host_path) // check settings in copy path (not hostRoot) in case user wants to copy into folder that is not hostRoot
    result = container_runtime.builder.loadConfiguration(stack_path, (ps_object.project_settings.get('config-files') as Array<string>) || [])
    const configuration:StackConfiguration = (result.success) ? result.data : container_runtime.builder.emptyConfiguration()
    // -- 3. copy files --------------------------------------------------------
    const rsync_options: RsyncOptions = {
      "host-path": host_path,
      volume: file_volume_id,
      direction: "to-host",
      mode: copy_options.mode,
      verbose: copy_options.verbose,
      files: configuration.getRsyncDownloadSettings(true)
    }
    result = syncHostDirAndVolume(container_runtime, rsync_options, copy_options?.manual || false)
    if(!result.success) return printResultState(result)
  })
  return result
}

export function jobExec(container_runtime:ContainerRuntime, job_id: string, shell_job_options:JobOptions, output_options:OutputOptions={verbose: false, explicit: false, silent: false})
{
  // -- get job information ----------------------------------------------------
  var result = matchingJobInfo(container_runtime.runner, [job_id], [""])
  if(!result.success) return result
  const job_info = result.data[0] // only shell into first resut
  // -- extract hostRoot and file_volume_id ------------------------------------
  const host_root = job_info?.labels?.hostRoot || ""
  const file_volume_id = job_info?.labels?.[file_volume_label] || ""
  const job_stack_path = job_info?.labels?.stack || ""
  if(!host_root) return result.pushWarning(WarningStrings.JOBEXEC.NO_HOSTROOT(job_info.id))
  //if(!file_volume_id) return result.pushWarning(WarningStrings.JOBEXEC.NO_VOLUME(job_info.id))
  // -- set job properties -----------------------------------------------------
  shell_job_options['stack-path'] = shell_job_options['stack-path'] || job_stack_path
  shell_job_options['host-root'] = host_root
  if(file_volume_id)
  {
    shell_job_options['file-access'] = "volume"
    shell_job_options['file-volume-id'] = file_volume_id
  }
  else // if no volume bind to job-host root (for local this is equivalent to job:shell, however this enables remote driver to shell into a bound job)
  {
    shell_job_options['file-access'] = "bind"
  }
  return jobStart(container_runtime, shell_job_options, output_options)
}

export function bundleProject(container_runtime: ContainerRuntime, options: ProjectBundleOptions)
{
  const settings_dir = projectSettingsDirPath(options["bundle-path"])   // directory that stores project settings yml & stack
  // -- ensure directory structure ---------------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.COPYING_FILES, {verbose: options?.verbose || false, silent: false, explicit: false})
  fs.copySync(options["project-root"], options["bundle-path"])
  fs.removeSync(settings_dir) // remove any existing settings
  // -- bundle project settings ------------------------------------------------
  const ps_options:ProjectBundleOptions = { ... options, ...{'bundle-path': settings_dir}}
  return bundleProjectSettings(container_runtime, ps_options)
}

export function bundleProjectSettings(container_runtime: ContainerRuntime, options: ProjectBundleOptions)
{
  printStatusHeader(StatusStrings.BUNDLE.PROJECT_SETTINGS, {verbose: options?.verbose || false, silent: false, explicit: false})
  var {result, project_settings} = loadProjectSettings(options["project-root"])
  if(!result.success) return result
  // -- ensure directory structure ---------------------------------------------
  const bundle_stacks_dir = path.join(options["bundle-path"], 'stacks')
  fs.ensureDirSync(bundle_stacks_dir)
  // -- adjust project settings ------------------------------------------------
  const stack_name = container_runtime.builder.stackName(options["stack-path"])
  project_settings.remove('stacks-dir')
  project_settings.remove('config-files')
  project_settings.remove('remote-name')
  project_settings.set({stack: `./stacks/${stack_name}`})
  if(options?.["stacks-dir"]) project_settings.set({'stacks-dir': 'stacks'})
  result = project_settings.writeToFile(path.join(options['bundle-path'], project_settings_file))
  // -- copy stacks into bundle ------------------------------------------------
  const stacks = ((options?.["stacks-dir"]) ? listStackNames(options["stacks-dir"], true) : []).concat(options["stack-path"])
  const unique_stacks = [... new Set(stacks)]
  unique_stacks.map((stack_path:string) => {
    const bundle_result = bundleStack(container_runtime, {
      "stack-path": stack_path,
      "config-files": options["config-files"],
      "bundle-path": path.join(bundle_stacks_dir, path.basename(stack_path)),
      "build-mode": "build",
      "verbose": options.verbose || false
      })
    if(!bundle_result.success) result.pushWarning(WarningStrings.BUNDLE.FAILED_BUNDLE_STACK(stack_path))
    })
  return result
}

export function bundleStack(container_runtime: ContainerRuntime, options: StackBundleOptions)
{
  // -- ensure that stack can be loaded ----------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.STACK_BUILD(options['stack-path']), {verbose: options?.verbose || false, silent: false, explicit: false})
  var result:ValidatedOutput
  if(options['build-mode'] === "no-build")
    result = container_runtime.builder.loadConfiguration(options['stack-path'], options['config-files'])
  else
    result = buildAndLoad(container_runtime.builder, options['build-mode'] || "build", options["stack-path"], options["config-files"])
  if(!result.success) return result
  const configuration:StackConfiguration = result.data
  // -- prepare configuration for bundling -------------------------------------
  const copy_ops:Array<{source: string, destination: string}> = []
  const rsync_settings = {
    upload: configuration.getRsyncUploadSettings(true),
    download: configuration.getRsyncDownloadSettings(true)
  }
  // --> 1. remove binds
  result = configuration.removeExternalBinds(options["stack-path"])
  printResultState(result) // print any warnings
  // --> 2. adjust rsync file paths
  const bundleRsyncFile = (direction:"upload"|"download", file:"include"|"exclude") => {
    if(rsync_settings?.[direction]?.[file] && FileTools.existsFile(rsync_settings?.[direction]?.[file] || "")) {
      const new_file_path = stack_bundle_rsync_file_paths[direction][file]
      copy_ops.push({
        source: rsync_settings[direction][file],
        destination: path.join(options["bundle-path"], new_file_path)
      })
      rsync_settings[direction][file] = new_file_path
    }
  }
  let ds: Array<"upload"|"download"> = ["upload", "download"]
  let ft: Array<"include"|"exclude"> = ["include", "exclude"]
  for (const direction of ds) {
    for (const file of ft) {
      bundleRsyncFile(direction, file)
    }
  }
  configuration.setRsyncUploadSettings(rsync_settings.upload)
  configuration.setRsyncDownloadSettings(rsync_settings.download)
  // --> 3. copy stack
  fs.ensureDirSync(options["bundle-path"])
  if(options?.['config-files-only'])
    container_runtime.builder.copyConfig(
      options["stack-path"],
      options["bundle-path"],
      configuration)
  else
    container_runtime.builder.copy(
      options["stack-path"],
      options["bundle-path"],
      configuration)
  // --> 4. copy additional files
  copy_ops.map((e:{source:string, destination:string}) =>
    fs.copySync(e.source, e.destination, {preserveTimestamps: true}))
  return new ValidatedOutput(true)
}

// == JOB INFO FUNCTIONS =======================================================

// returns all running job ids
export function allJobIds(runner: RunDriver, stack_paths: Array<string>=[], status:string = "")
{
  return runner.jobInfo(stack_paths, status).map((x:Dictionary) => x.id)
}

// returns array of jobs ids for all jobs whose id begins with the letters in any string in the passed parameter "id"
export function matchingJobIds(runner: RunDriver, ids: Array<string>, stack_paths: Array<string>, status:string = "")
{
  const result = matchingJobInfo(runner, ids, stack_paths, status)
  if(result.success) result.data = result.data.map((x:Dictionary) => x.id)
  return result
}

// returns array of jobs info objects for all jobs whose id begins with the letters in any string in the passed parameter "id"
export function matchingJobInfo(runner: RunDriver, ids: Array<string>, stack_paths: Array<string>, status:string = "")
{
  ids = ids.filter((id:string) => id !== "") // remove empty ids
  if(ids.length < 1) return new ValidatedOutput(false, [], [ErrorStrings.JOBS.INVALID_ID])
  return filterJobInfoByID(runner.jobInfo(stack_paths, status), new RegExp(`^(${ids.join('|')})`))
}

// -----------------------------------------------------------------------------
// FILTERJOBINFOBYID filters the output of RunDriver.jobInfo() and returns all
// jobs whose ID satisfies the provided regular expression.
// -- Parameters ---------------------------------------------------------------
// job_info: Array<Dictionary> - absolute path where cli was called from
// regex: RegExp - regular expression
// -- Returns ------------------------------------------------------------------
// ValidatedOutput - data contains array of Dictinary with matching job info
function filterJobInfoByID(job_info: Array<Dictionary>, regex: RegExp)
{
  const matching_jobs = job_info.filter((job:Dictionary) => regex.test(job.id))
  return (matching_jobs.length > 0) ?
    new ValidatedOutput(true, matching_jobs) :
    new ValidatedOutput(false, [], [ErrorStrings.JOBS.NO_MATCHING_ID])
}

// determines if job with given name exists. Refactor with resultNameId
export function jobNameLabeltoID(runner: RunDriver, name: string, stack_path: string, status:string = "")
{
  const job_info = runner.jobInfo([stack_path], status)
  const index    = job_info.map((x:Dictionary) => x?.labels?.name).indexOf(name)
  return (index == -1) ? false : job_info[index].id
}

// == FILE VOLUME FUNCTIONS ====================================================

// -----------------------------------------------------------------------------
// CREATEANDMOUNTFILEVOLUME create a new volume and then uses rsync to copy
// files from the hostRoot into the volume. This volume is then mounted to the
// configuration at the ContainerRoot
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner used to create volume
// configuration - configuration for use to run associated job. This function
//                 will: (1) read the rsync upload include and exclude files
//                 from this configuration, and (2) add a mount pointing to the
//                 file volume to the configuration.
// hostRoot:string  - Project root folder
// verbose: boolean - flag for rsync
// -----------------------------------------------------------------------------
export function createAndMountFileVolume(container_runtime: ContainerRuntime, configuration: StackConfiguration, hostRoot: string, verbose: boolean=false)
{
  // -- create volume ----------------------------------------------------------
  var result = container_runtime.runner.volumeCreate({});
  if(!result.success) return result
  const volume_id = result.data
  // -- sync to volume ---------------------------------------------------------
  const copy_options: RsyncOptions = {
    "host-path": hostRoot,
    volume: volume_id,
    direction: "to-volume",
    mode: "mirror",
    verbose: verbose,
    files: configuration.getRsyncUploadSettings(true)
  }
  // -- check if runtime is docker and chownvolume flags is active -------------
  if( (configuration.getFlags()?.['chown-file-volume'] === true) )  {
      // -- get user id & set chown property -----------------------------------
      const id_result = (new ShellCommand(false, false)).output('id', {u:{}}, [], {}, 'trim')
      if(id_result.success && id_result.data) copy_options.chown = id_result.data
  }

  result = syncHostDirAndVolume(container_runtime, copy_options)
  if(!result.success) return result
  // -- mount volume to job ----------------------------------------------------
  mountFileVolume(configuration, hostRoot, volume_id)
  return new ValidatedOutput(true)
}

// -----------------------------------------------------------------------------
// MOUNTFILEVOLUME mounts a volume at containerRoot with name of hostRoot
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner used to create volume
// configuration:Configuration - Object that inherits from abstract class Configuration
// hostRoot:string - Project root folder
// volume_id:string - volume id
// -----------------------------------------------------------------------------
export function mountFileVolume(configuration: StackConfiguration, hostRoot: string, volume_id: string)
{
  const hostRoot_basename = path.basename(hostRoot)
  configuration.addVolume(volume_id, path.posix.join(configuration.getContainerRoot(), hostRoot_basename))
  configuration.addLabel(file_volume_label, volume_id)
}

// -----------------------------------------------------------------------------
// SYNCHOSTDIRANDVOLUME uses rsync to sync a folder on host with a volume
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner that is used to start rsync job
// copy_options: string - options for file sync
// -----------------------------------------------------------------------------
export function syncHostDirAndVolume(container_runtime: ContainerRuntime, copy_options:RsyncOptions, manual_copy:boolean = false)
{
  if(!copy_options["host-path"]) return new ValidatedOutput(true)
  if(!copy_options["volume"]) return new ValidatedOutput(true)
  // -- create configuration for rsync job -------------------------------------
  const rsync_configuration = rsyncJobConfiguration(container_runtime.runner, copy_options)
  // -- ensure rsync container is built ----------------------------------------
  if(!container_runtime.builder.isBuilt(rsync_constants.stack_path, rsync_configuration)) {
    const result = container_runtime.builder.build(rsync_constants.stack_path, rsync_configuration)
    if(!result.success) return result
  }
  // -- set rsync flags --------------------------------------------------------
  const rsync_flags:Dictionary = {a: {}}
  addrsyncIncludeExclude( // -- mount any rsync include or exclude files -------
      rsync_configuration,
      rsync_flags,
      copy_options.files || {include: "", exclude: ""}
  )
  switch(copy_options.mode)
  {
    case "update":
      rsync_flags['update'] = {}
      break
    case "overwrite":
      break
    case "mirror":
      rsync_flags['delete'] = {}
      break
  }
  if(copy_options?.verbose) rsync_flags.v = {}
  // -- set rsync command ------------------------------------------------------
  const rsync_base_command = rsyncCommandString(
    rsync_constants.source_dir,
    rsync_constants.dest_dir,
    rsync_flags
  )
  if(manual_copy)
    rsync_configuration.setCommand('sh')
  else if(copy_options['chown'])
    rsync_configuration.setCommand(`${rsync_base_command} && chown -R ${copy_options['chown']}:${copy_options['chown']} ${rsync_constants.dest_dir}`)
  else
    rsync_configuration.setCommand(rsync_base_command)
  // -- start rsync job --------------------------------------------------------
  return container_runtime.runner.jobStart(
    rsync_constants.stack_path,
    rsync_configuration,
    {verbose: false, explicit: false, silent: false}
  )
}

// -----------------------------------------------------------------------------
// RSYNCCONFIGURATION helper function that creates an new configuration for the
// rsync job that either copies files from host to container or from container
// to host
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - run driver that will be used to run job
// copy_direction: string - specified which direction the copy is going. It can
//                          either be "to-host" or "to-container"
// -----------------------------------------------------------------------------
function rsyncJobConfiguration(runner: RunDriver, copy_options: RsyncOptions)
{
  const rsync_configuration = runner.emptyConfiguration()
  if(copy_options["direction"] == "to-host")
  {
    rsync_configuration.addVolume(copy_options["volume"], rsync_constants.source_dir)
    rsync_configuration.addBind(copy_options["host-path"], rsync_constants.dest_dir)
  }
  else if(copy_options["direction"] == "to-volume")
  {
    rsync_configuration.addVolume(copy_options["volume"], rsync_constants.dest_dir)
    rsync_configuration.addBind(copy_options["host-path"], rsync_constants.source_dir)
  }
  rsync_configuration.setRemoveOnExit(true)
  rsync_configuration.setSyncronous(true)
  return rsync_configuration
}

// -----------------------------------------------------------------------------
// MOUNTRSYNCFILES helper function that alters configuration of an rsync job by
// adding mounts for any include or exclude files. It will also add the
// include-from and exclude-from to the Dictionary rsync-flags that can be
// passed to rsyncCommandString
// -- Parameters ---------------------------------------------------------------
// rsync_configuration: Configuration - configuration for rsync job
// rsync_flags: Dictionary - flags that will be passed to rsyncCommandString
// files: object containing absoluve paths include and exclude files for rsync job
// -----------------------------------------------------------------------------
function addrsyncIncludeExclude(rsync_configuration: StackConfiguration, rsync_flags: Dictionary, files: {include: string, exclude: string})
{
  const mount_rsync_configfile = (type:"include"|"exclude") => {
    const host_file_path = files[type]
    if(host_file_path && FileTools.existsFile(host_file_path)) {
      const container_file_name = rsync_constants[(`${type}_file_name` as ("include_file_name"|"exclude_file_name"))]
      const container_file_path = path.posix.join(rsync_constants.config_dir, container_file_name)
      rsync_flags[`${type}-from`] = container_file_path
      rsync_configuration.addBind(host_file_path, container_file_path)
    }
  }
  // note: always add include before exclude
  mount_rsync_configfile('include')
  mount_rsync_configfile('exclude')
}

export function rsyncCommandString(source: string, destination: string, flags: Dictionary)
{
  const shell = new ShellCommand(false, false)
  const args  = [source, destination]
  return shell.commandString('rsync', flags, args)
}

// == CONFIGURATION MODIFICATION FUNCTIONS ====================================

// -----------------------------------------------------------------------------
// SETRELATIVEWORKDIR alters the working dir of a configuration iff hostDir is a
// child of hostRoot. Let hostPath be a child of hostRoot, and let X be the
// relative path from hostRoot to hostDir. This functions sets these working dir
// of the container to path.join(containerRoot, X)
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// hostRoot      - Project root folder
// containerRoot - Container root folder
// hostDir       - user directory (defaults to process.cwd())
// -----------------------------------------------------------------------------
export function setRelativeWorkDir(configuration: StackConfiguration, hostRoot: string, hostDir: string = process.cwd())
{
  if(!hostRoot) return configuration.setWorkingDir(configuration.getContainerRoot()) // should only be set if containerRoot is set
  const ced = containerWorkingDir(hostDir, hostRoot, configuration.getContainerRoot())
  if(ced) configuration.setWorkingDir(ced)
}

// -----------------------------------------------------------------------------
// BINDHOSTROOT adds a mount with type bind to a configuration that maps
// hostRoot (on host) to containerRoot (on container)
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// hostRoot      - Project root folder
// containerRoot - Container root folder
// -----------------------------------------------------------------------------
export function bindHostRoot(configuration: StackConfiguration, hostRoot: string)
{
  if(!hostRoot) return
  const hostRoot_basename = path.basename(hostRoot)
  configuration.addBind(hostRoot, path.posix.join(configuration.getContainerRoot(), hostRoot_basename))
}

// -----------------------------------------------------------------------------
// ENABLEX11: bind X11 directory and sets environment variable DISPLAY in container.
// -- Parameters ---------------------------------------------------------------
// configuration  - Object that inherits from abstract class Configuration
// -----------------------------------------------------------------------------
export function enableX11(configuration: StackConfiguration, explicit:boolean = false)
{
  const platform = os.platform()

  if(["linux", "darwin"].includes(platform) == false) { // -- unsupported OS ---
    return printResultState(
      new ValidatedOutput(true, [], [], [WarningStrings.X11.FLAGUNAVALIABLE])
    )
  }

  if(!FileTools.existsDir(X11_POSIX_BIND)) { // -- nonexistant X11 folder ------
    return printResultState(
      new ValidatedOutput(true, [], [], [WarningStrings.X11.MISSINGDIR(X11_POSIX_BIND)])
    )
  }

  switch(platform)
  {
    case "darwin": // == MAC ===================================================
      const sockets = fs.readdirSync(X11_POSIX_BIND)?.filter(file_name => new RegExp(/^X\d+$/)?.test(file_name))?.sort();
      if(sockets.length < 1) { // -- no sockets --------------------------------
        return printResultState(
          new ValidatedOutput(true, [], [], [WarningStrings.X11.MACMISSINGSOCKET(X11_POSIX_BIND)])
        )
      }
      const socket_number:string = sockets.pop()?.replace("X", "") || "0" // select socket with highest number - this is useful since an xQuartx chrach will leave behind a non functional socket
      configuration.addBind(X11_POSIX_BIND, X11_POSIX_BIND)
      configuration.addRunEnvironmentVariable("DISPLAY", `host.docker.internal:${socket_number}`)
      const shell = new ShellCommand(explicit, false)
      shell.output("xhost +localhost", {}, []);
      break;
    case "linux": // == LINUX ==================================================
      configuration.addBind(X11_POSIX_BIND, X11_POSIX_BIND, {selinux: false})
      configuration.addRunEnvironmentVariable("DISPLAY", `$DISPLAY`)
  }

  // -- add special flags for podman -------------------------------------------
  if(configuration instanceof PodmanStackConfiguration) {
    configuration.addFlag("network", "host") // allows reuse of DISPLAY variable from host
    configuration.addFlag("security-opt", "label=disable") // allows /tmp/X11 directory to be accesible in container
  }
}

// -----------------------------------------------------------------------------
// addGenericLabels adds important labels for each job
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// hostRoot: string - hostRoot of job
// stack_path: string - absolute path to stack used to run job
// -----------------------------------------------------------------------------
export function addGenericLabels(configuration: StackConfiguration, hostRoot: string, stack_path: string)
{
  if(hostRoot) configuration.addLabel("hostRoot", hostRoot)
  configuration.addLabel("containerRoot", configuration.getContainerRoot())
  configuration.addLabel("stack", stack_path)
}

// -----------------------------------------------------------------------------
// PREPENDXAUTH: prepend commands to add xAuth from host into container, onto
// any existing command.
// -- Parameters ---------------------------------------------------------------
// command  - existing command string
// explicit: boolean - determines if commands run on host are to be printed
// -----------------------------------------------------------------------------
export function prependXAuth(command: string, explicit: boolean = false)
{
  if(os.platform() != "linux") return command
  const shell = new ShellCommand(explicit, false)
  const shell_result = shell.output("xauth list $DISPLAY", {}, [], {}, "trim")
  if(shell_result.success) {
    const secret = shell_result.data.split("  ").pop(); // assume format: HOST  ACCESS-CONTROL  SECRET
    const script = ['WD=$(pwd)', 'cd', 'touch ~/.Xauthority', `xauth add $DISPLAY . ${secret}`, 'cd $WD', command].join(" && ")
    return `bash -c ${ShellCommand.bashEscape(script)}`
  }
  return command
}

// == AUTOLOAD & PROJECT SETTINGS FUNCTIONS ====================================

// SCANFORSETTINGSDIRECTORY searchs up the directory structure for a settings
// folder that contains a settings file with hostRoot: auto.
// -- Parameters ---------------------------------------------------------------
// dirpath: string - starting search location
// -- Returns ------------------------------------------------------------------
// ValidatedOutput - data is an object with fields:
//    - hostRoot: hostRoot where settings directory lives
//    - settings: settings that where loaded from file
export function scanForSettingsDirectory(dirpath: string):{result: ValidatedOutput, project_settings: ProjectSettings}
{
  var dirpath_parent = dirpath
  var result: ValidatedOutput
  var project_settings:ProjectSettings = new ProjectSettings()

  do {
    dirpath = dirpath_parent
    dirpath_parent = path.dirname(dirpath)
    // -- exit if settings file is invalid -------------------------------------
    ;( {result, project_settings} = loadProjectSettings(dirpath) )              // see https://stackoverflow.com/questions/27386234/object-destructuring-without-var
    printResultState(result) // print any warnings if file is invalid
    if(result.success && project_settings.get("project-root") == 'auto') {
      project_settings.set({"project-root": dirpath})
      return {
        result: result,
        project_settings: project_settings
      }
    }
  } while(dirpath != dirpath_parent)

  return {
    result: new ValidatedOutput(false),
    project_settings: project_settings
  }
}

// -----------------------------------------------------------------------------
// LOADPROJECTSETTINGS: loads any project settings from the cjr dir in hostRoot
// -- Parameters ---------------------------------------------------------------
// hostRoot: string - project hostRoot
// -- Returns ------------------------------------------------------------------
// result: ValidatedOutput - result from file load
// project_settings: ProjectSettings
// -----------------------------------------------------------------------------
export function loadProjectSettings(project_root: string):{result: ValidatedOutput, project_settings: ProjectSettings}
{
  const project_settings = new ProjectSettings()
  const result = project_settings.loadFromFile(projectSettingsYMLPath(project_root))
  return {result: result, project_settings: project_settings}
}

// == Interactive Functions ====================================================

export async function promptUserForJobId(runner: RunDriver, stack_path: Array<string>, status:string="", silent: boolean = false)
{
  if(silent) return false;
  const job_info = runner.jobInfo(stack_path, status)
  return await promptUserForId(job_info);
}

// helper function for promptUserForJobId & promptUserForResultId
export async function promptUserForId(id_info: Array<Dictionary>)
{
  const response = await inquirer.prompt([{
  name: 'id',
  message: 'Select an id:',
  prefix: "\b",
  suffix: "",
  type: 'list',
  pageSize: Math.min(id_info.length + 1, 30),
  choices: id_info.map((j:Dictionary) => {
    return {
      name: chalk`{italic ID}: ${JSTools.clipAndPad(j.id, 12, 15, true)} {italic COMMAND}: ${JSTools.clipAndPad(j.command, 20, 25, false)} {italic STATUS}: ${j.statusString}`,
      value: j.id
    }
  }).concat({name: "Exit", value: ""}),
}])
return response.id;
}

// == PROJECT ID FUNCTIONS =====================================================

// -----------------------------------------------------------------------------
// ENSUREPROJECTID: ensures that there is a file in the project settings folder
// that contains the project id.
// -- Parameters ---------------------------------------------------------------
// hostRoot  - project host root
// -----------------------------------------------------------------------------

export function ensureProjectId(hostRoot: string)
{
  if(!hostRoot) return new ValidatedOutput(false)
  var result = getProjectId(hostRoot)
  if(result.success) return result
  const file = new JSONFile(projectSettingsDirPath(hostRoot), true)
  const id = `${path.basename(hostRoot)}-${new Date().getTime()}`
  file.write(project_idfile, id)
  return getProjectId(hostRoot)
}

// -----------------------------------------------------------------------------
// ENSUREPROJECTID: returns ValidatdOutput that contains projectId
// -- Parameters ---------------------------------------------------------------
// hostRoot  - project host root
// -----------------------------------------------------------------------------

export function getProjectId(hostRoot: string)
{
  if(!hostRoot) return new ValidatedOutput(false)
  const proj_settings_abspath = projectSettingsDirPath(hostRoot)
  const file = new JSONFile(proj_settings_abspath, false)
  const result = file.read(project_idfile)
  if(result.success && result.data == "") // -- check if data is empty -----
    return new ValidatedOutput(false, [], [
      ErrorStrings.PROJECTIDFILE.EMPTY(path.join(proj_settings_abspath, project_idfile))
    ])
  return result
}

// == MISC FUNCTIONS ===========================================================

// -----------------------------------------------------------------------------
// CONTAINERWORKINGDIR determines the appropriate cwd for a container so that it
// replicates the feel of working on the local machine if the user is currently
// cd into the hostRoot folder.
// -- Parameters ---------------------------------------------------------------
// cli_cwd (string) - absolute path where cli was called from
// hRoot   (string) - absolite path of project root folder
// croot   (string) - absolute path where hroot is mounted on container
// -----------------------------------------------------------------------------
export function containerWorkingDir(cli_cwd:string, hroot: string, croot: string)
{
  const hroot_arr:Array<string> = PathTools.split(hroot)
  const rel_path = PathTools.relativePathFromParent(hroot_arr, PathTools.split(cli_cwd))
  return (rel_path === false) ? false : [croot.replace(/\/$/, "")].concat(hroot_arr.pop() || "", rel_path).join("/")
}

export function listStackNames(stacks_dir:string, absolute:boolean)
{
  const stack_names = fs.readdirSync(stacks_dir).filter((file_name: string) => !/^\./.test(path.basename(file_name)) && FileTools.existsDir(path.join(stacks_dir, file_name)))
  if(absolute) return stack_names.map((name:string) => path.join(stacks_dir, name))
  else return stack_names
}

// -----------------------------------------------------------------------------
// JOBTOIMAGE creates an image from a running or completed job. If image_name is
// blank it will overwrite stack image
// -- Parameters ---------------------------------------------------------------
// runner       (RunDriver) - JSONFILE object for writing to disk
// result       (ValidatedOutput) - result from runner.createJob that contains ID
// image_name   (string) - name of new imageName
// stack_path   (string) - name of container stack
// remove_job   (boolean) - if true job is removed on exit
// -----------------------------------------------------------------------------
export async function jobToImage(runner: RunDriver, result: ValidatedOutput, image_name: string, remove_job: boolean = false, interactive: boolean = false)
{
  if(result.success === false) return;
  const job_id = result.data
  var response: Dictionary = {}
  if(interactive) {
    response = await inquirer.prompt([
      {
        name: "flag",
        message: `Save container to image "${image_name}"?`,
        type: "confirm",
      }
    ])
  }
  if(!interactive || response?.flag == true) runner.jobToImage(job_id, image_name)
  if(remove_job) runner.jobDelete([job_id])
}
