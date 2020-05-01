import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as inquirer from 'inquirer'
import * as chalk from 'chalk'
import { RunDriver, JobState, JobInfo, JobPortInfo, JobInfoFilter, NewJobInfo } from '../drivers/abstract/run-driver'
import { BuildDriver } from '../drivers/abstract/build-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { PathTools } from '../fileio/path-tools'
import { FileTools } from '../fileio/file-tools'
import { JSONFile } from '../fileio/json-file'
import { ValidatedOutput } from '../validated-output'
import { printResultState, trim } from './misc-functions'
import { ShellCommand } from '../shell-command'
import { X11_POSIX_BIND, project_idfile, projectSettingsDirPath, projectSettingsYMLPath, rsync_constants, file_volume_label, project_settings_file, stack_bundle_rsync_file_paths, stack_path_label, host_root_label, container_root_label } from '../constants'
import { buildAndLoad, BuildOptions } from '../functions/build-functions'
import { ErrorStrings, WarningStrings, StatusStrings } from '../error-strings'
import { PodmanStackConfiguration } from '../config/stacks/podman/podman-stack-configuration'
import { JSTools } from '../js-tools'
import { ProjectSettings } from '../config/project-settings/project-settings'
import { JobConfiguration } from '../config/jobs/job-configuration'

// == TYPES ====================================================================

export type Dictionary = {[key: string]: any}

// -- options for core function startJob ---------------------------------------
export type port   = {hostPort:number, containerPort: number, address?: string}
export type label  = {key:string, value: string}
export type ports  = Array<port>
export type labels = Array<label>
export type buildmodes = "no-rebuild"|"build"|"build-nocache"

export type JobOptions = {
    "stack-path": string,                                                       // stack that should be used to run job
    "config-files": Array<string>,                                              // any additional configuration files for stack
    "build-options": BuildOptions,                                              // specifies how to build stack before run
    "command": string,                                                          // command for job
    "entrypoint"?: Array<string>,                                               // optional entrypoint override
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
  "build-options"?: BuildOptions,
  "verbose"?:     boolean
}

// -- used by function bundleStack
export type StackBundleOptions =
{
  "stack-path":           string              // absolute path to stack that should be bundled
  "config-files":         Array<string>,
  "bundle-path":          string,
  "config-files-only"?:   boolean, // if selected only configuration files are bundled
  "build-options"?:       BuildOptions,
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
export function jobStart(container_runtime: ContainerRuntime, job_options: JobOptions, output_options: OutputOptions={verbose: false, explicit: false, silent: false}) : ValidatedOutput<NewJobInfo>
{
  const failed_result = new ValidatedOutput(false, {"id":"", "output": "", "exit-code": 1});
  // -- 1. build stack and load stack configuration ----------------------------
  printStatusHeader(StatusStrings.JOBSTART.BUILD, output_options)
  const bl_result = buildAndLoad(
    container_runtime.builder,
    job_options["build-options"],
    job_options["stack-path"],
    job_options["config-files"]
  )
  if(!bl_result.success) return failed_result.absorb(bl_result)
  const stack_configuration:StackConfiguration = bl_result.value
  const job_configuration:JobConfiguration<StackConfiguration> = container_runtime.runner.emptyJobConfiguration(stack_configuration)
  // -- 2.1 update configuration: mount Files ----------------------------------
  if(job_options["host-root"] && job_options["file-access"] === "bind")
    bindHostRoot(stack_configuration, job_options["host-root"])
  else if(job_options["host-root"] && job_options["file-access"] === "volume" && job_options?.["file-volume-id"])
    mountFileVolume(job_configuration, job_options["host-root"], job_options["file-volume-id"])
  else if(job_options["host-root"] && job_options["file-access"] === "volume") {
    printStatusHeader(StatusStrings.JOBSTART.VOLUMECOPY_TOVOLUME, output_options)
    const cmv_result = createAndMountFileVolume(container_runtime, job_configuration, job_options["host-root"], output_options.verbose)
    if(!cmv_result.success) return failed_result.absorb(cmv_result)
  }
  // -- 2.2 update configuration: apply options --------------------------------
  if(job_options?.ports)
    job_options["ports"].map((p:port) => stack_configuration.addPort(p.hostPort, p.containerPort, p.address))
  if(job_options?.x11) enableX11(stack_configuration, output_options.explicit)
  if(job_options?.environment) Object.keys(job_options['environment']).map((key:string) =>
    stack_configuration.addEnvironmentVariable(key, job_options['environment']?.[key] || "")
  )
  if(job_options?.entrypoint) stack_configuration.setEntrypoint(job_options.entrypoint)
  // -- 3. set up job configuration --------------------------------------------------

  if(job_options?.labels) job_options["labels"].map(
    (flag:{key:string, value: string}) => job_configuration.addLabel(flag.key, flag.value)
  )
  setRelativeWorkDir(job_configuration, job_options["host-root"] || "", job_options["cwd"])
  job_configuration.command = [(job_options["x11"]) ? prependXAuth(job_options["command"], output_options.explicit) : job_options["command"]]
  job_configuration.synchronous = job_options["synchronous"]
  job_configuration.remove_on_exit = job_options["remove"]
  addGenericLabels(job_configuration, job_options["host-root"] || "", job_options["stack-path"])
  // -- 3. start job -----------------------------------------------------------
  printStatusHeader(StatusStrings.JOBSTART.START, output_options)
  const result = container_runtime.runner.jobStart(job_configuration, 'inherit')
  // -- print id ---------------------------------------------------------------
  printStatusHeader(StatusStrings.JOBSTART.JOB_ID, output_options)
  if(output_options.verbose) console.log(result.value.id)
  if(result.value.id === "") result.pushError(ErrorStrings.JOBS.FAILED_START)
  return result
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
export function jobCopy(container_runtime: ContainerRuntime, copy_options: CopyOptions) : ValidatedOutput<undefined>
{
  printStatusHeader(StatusStrings.JOBSTART.VOLUMECOPY_TOHOST, {verbose: copy_options.verbose, explicit: false, silent: false})
  const result = new ValidatedOutput(true, undefined);
  // -- get information on all matching jobs -----------------------------------
  var ji_result = container_runtime.runner.jobInfo({
    "ids": copy_options['ids'],
    "stack-paths": copy_options["stack-paths"] || undefined
  })
  if(!ji_result.success) return result.absorb(ji_result)
  const job_info_array = ji_result.value
  // -- copy results from all matching jobs ------------------------------------
  job_info_array.map((job:Dictionary) => {
    // -- 1. extract label information -----------------------------------------
    const id = job.id;
    const hostRoot = job.labels?.[host_root_label] || ""
    const file_volume_id = job.labels?.[file_volume_label] || ""
    const stack_path = job.labels?.[stack_path_label] || ""
    const host_path  = copy_options?.["host-path"] || hostRoot // set copy-path to job hostRoot if it's not specified
    if(!hostRoot) return result.pushWarning(WarningStrings.JOBCOPY.NO_HOSTROOT(id))
    if(!file_volume_id) return result.pushWarning(WarningStrings.JOBCOPY.NO_VOLUME(id))
    // -- 2. load stack configuration & get download settings ------------------
    const load_result = loadProjectSettings(host_path) // check settings in copy path (not hostRoot) in case user wants to copy into folder that is not hostRoot
    const lc_result = container_runtime.builder.loadConfiguration(stack_path, (load_result.value.get('config-files') as Array<string>) || [])
    const configuration:StackConfiguration = (lc_result.success) ? lc_result.value : container_runtime.builder.emptyStackConfiguration()
    // -- 3. copy files --------------------------------------------------------
    const rsync_options: RsyncOptions = {
      "host-path": host_path,
      volume: file_volume_id,
      direction: "to-host",
      mode: copy_options.mode,
      verbose: copy_options.verbose,
      files: configuration.getRsyncDownloadSettings(true)
    }
    result.absorb(syncHostDirAndVolume(container_runtime, rsync_options, copy_options?.manual || false))
  })
  return result
}

export function jobExec(container_runtime:ContainerRuntime, parent_job:{"id": string, "allowable-stack-paths"?: Array<string>}, shell_job_options:JobOptions, output_options:OutputOptions={verbose: false, explicit: false, silent: false}) : ValidatedOutput<NewJobInfo>
{
  const failed_result = new ValidatedOutput(false, {"id":"", "output": "", "exit-code": 1});
  const nohost_result = new ValidatedOutput(true, {"id":"", "output": "", "exit-code": 0});
  // -- get job information ----------------------------------------------------
  const job_info_request = firstJob(
    container_runtime.runner.jobInfo({
      "ids": [parent_job.id],
      "stack-paths": parent_job?.["allowable-stack-paths"]
    })
  )
  if(!job_info_request.success) return failed_result.absorb(job_info_request)
  const job_info = job_info_request.value // only shell into first resut
  // -- extract hostRoot and file_volume_id ------------------------------------
  const host_root = job_info.labels?.[host_root_label] || ""
  const file_volume_id = job_info.labels?.[file_volume_label] || ""
  const job_stack_path = job_info.labels?.[stack_path_label] || ""
  if(!host_root) nohost_result.pushWarning(WarningStrings.JOBEXEC.NO_HOSTROOT(job_info.id))
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

export function bundleProjectSettings(container_runtime: ContainerRuntime, options: ProjectBundleOptions) : ValidatedOutput<undefined>
{
  printStatusHeader(StatusStrings.BUNDLE.PROJECT_SETTINGS, {verbose: options?.verbose || false, silent: false, explicit: false})
  const result = new ValidatedOutput(true, undefined)
  const load_result = loadProjectSettings(options["project-root"])
  if(!load_result.success) return new ValidatedOutput(false, undefined).absorb(load_result)
  const project_settings = load_result.value;
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
  const wf_result = project_settings.writeToFile(path.join(options['bundle-path'], project_settings_file))
  if(!wf_result.success) return new ValidatedOutput(false, undefined).absorb(wf_result)
  // -- copy stacks into bundle ------------------------------------------------
  const stacks = ((options?.["stacks-dir"]) ? listStackNames(options["stacks-dir"], true) : []).concat(options["stack-path"])
  const unique_stacks = [... new Set(stacks)]
  unique_stacks.map((stack_path:string) => {
    const bundle_result = bundleStack(container_runtime, {
      "stack-path": stack_path,
      "config-files": options["config-files"],
      "bundle-path": path.join(bundle_stacks_dir, path.basename(stack_path)),
      "build-options": options["build-options"] || {},
      "verbose": options.verbose || false
      })
    if(!bundle_result.success) result.pushWarning(WarningStrings.BUNDLE.FAILED_BUNDLE_STACK(stack_path))
    })
  return result
}

export function bundleStack(container_runtime: ContainerRuntime, options: StackBundleOptions) : ValidatedOutput<undefined>
{
  // -- ensure that stack can be loaded ----------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.STACK_BUILD(options['stack-path']), {verbose: options?.verbose || false, silent: false, explicit: false})
  var bl_result = buildAndLoad(container_runtime.builder, options['build-options'] || {}, options["stack-path"], options["config-files"])
  if(!bl_result.success) return new ValidatedOutput(false, undefined).absorb(bl_result)
  const configuration:StackConfiguration = bl_result.value
  // -- prepare configuration for bundling -------------------------------------
  const copy_ops:Array<{source: string, destination: string}> = []
  const rsync_settings = {
    upload: configuration.getRsyncUploadSettings(true),
    download: configuration.getRsyncDownloadSettings(true)
  }
  // --> 1. remove binds
  const reb_result = configuration.removeExternalBinds(options["stack-path"])
  printResultState(reb_result) // print any warnings
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
  return new ValidatedOutput(true, undefined)
}

// == JOB INFO FUNCTIONS =======================================================

// returns ValidatedObject with ids of jobs
export function jobIds(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<Array<string>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true, job_info.value.map((ji:JobInfo) => ji.id))
}

export function volumeIds(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<Array<string>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true,
    job_info.value
    .map((ji:JobInfo) => ji.labels?.[file_volume_label] || "")
    .filter((s:string) => s !== "")
  )
}

export function firstJobId(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<string>
{
  if(job_info.value.length < 1)
    return new ValidatedOutput(false, "").pushError(ErrorStrings.JOBS.NO_MATCHING_ID)
  return new ValidatedOutput(true, job_info.value[0].id)
}

export function firstJob(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<JobInfo>
{
  const failure_output:JobInfo = {id: "", names: [], command: "", status: "", state: "dead", stack: "", labels: {}, ports: []}
  if(job_info.value.length < 1)
    return new ValidatedOutput(false, failure_output).pushError(ErrorStrings.JOBS.NO_MATCHING_ID)
  return new ValidatedOutput(true, job_info.value[0])
}

// returns ValidatedObject with first name of jobs
export function jobNames(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<Array<string>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true, job_info.value.map((ji:JobInfo) => ji.names.pop() || ""))
}

export function nextAvailablePort(runner: RunDriver, port:number=1024) : number
{
  const job_info = runner.jobInfo() // get all jobs
  if(!job_info.success) return port
  // -- extract port and order ascending ---------------------------------------
  const ports:Array<number> = []
  job_info.value.map( (job_info:JobInfo) => ports.push(
      ... job_info.ports.map( (port_info:JobPortInfo) => port_info.hostPort )
    )
  )
  const ord_ports = [... new Set(ports)].sort()
  // -- return next available port ---------------------------------------------
  for(var i = 0; i <= ord_ports.length; i ++)  {
    if(ord_ports[i] == port) port++ // port is already used. increment
    if(ord_ports[i] > port) return port //port is free
  }
  return port
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
export function createAndMountFileVolume(container_runtime: ContainerRuntime, configuration: JobConfiguration<StackConfiguration>, hostRoot: string, verbose: boolean=false) : ValidatedOutput<undefined>
{
  // -- create volume ----------------------------------------------------------
  const vc_result = container_runtime.runner.volumeCreate({});
  if(!vc_result.success) return new ValidatedOutput(false, undefined).absorb(vc_result)
  const volume_id = vc_result.value
  // -- sync to volume ---------------------------------------------------------
  const copy_options: RsyncOptions = {
    "host-path": hostRoot,
    volume: volume_id,
    direction: "to-volume",
    mode: "mirror",
    verbose: verbose,
    files: configuration.stack_configuration.getRsyncUploadSettings(true)
  }
  // -- check if runtime is docker and chownvolume flags is active -------------
  if( (configuration.stack_configuration.getFlags()?.['chown-file-volume'] === true) )  {
      // -- get user id & set chown property -----------------------------------
      const id_result = trim(new ShellCommand(false, false).output('id', {u:{}}, [], {}))
      if(id_result.success && id_result.value) copy_options.chown = id_result.value
  }

  const result = syncHostDirAndVolume(container_runtime, copy_options)
  if(!result.success) return result
  // -- mount volume to job ----------------------------------------------------
  mountFileVolume(configuration, hostRoot, volume_id)
  return result
}

// -----------------------------------------------------------------------------
// MOUNTFILEVOLUME mounts a volume at containerRoot with name of hostRoot
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner used to create volume
// configuration:Configuration - Object that inherits from abstract class Configuration
// hostRoot:string - Project root folder
// volume_id:string - volume id
// -----------------------------------------------------------------------------
export function mountFileVolume(configuration: JobConfiguration<StackConfiguration>, hostRoot: string, volume_id: string)
{
  const hostRoot_basename = path.basename(hostRoot)
  configuration.stack_configuration.addVolume(volume_id, path.posix.join(configuration.stack_configuration.getContainerRoot(), hostRoot_basename))
  configuration.addLabel(file_volume_label, volume_id)
}

// -----------------------------------------------------------------------------
// SYNCHOSTDIRANDVOLUME uses rsync to sync a folder on host with a volume
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner that is used to start rsync job
// copy_options: string - options for file sync
// -----------------------------------------------------------------------------
export function syncHostDirAndVolume(container_runtime: ContainerRuntime, copy_options:RsyncOptions, manual_copy:boolean = false) : ValidatedOutput<undefined>
{
  if(!copy_options["host-path"]) return new ValidatedOutput(true, undefined)
  if(!copy_options["volume"]) return new ValidatedOutput(true, undefined)
  // -- create stack configuration for rsync job -------------------------------
  const rsync_stack_configuration = rsyncStackConfiguration(container_runtime.runner, copy_options)
  // -- ensure rsync container is built ----------------------------------------
  if(!container_runtime.builder.isBuilt(rsync_constants.image, rsync_stack_configuration)) {
    const result = container_runtime.builder.build(rsync_constants.image, rsync_stack_configuration)
    if(!result.success) return result
  }
  // -- set rsync flags --------------------------------------------------------
  const rsync_flags:Dictionary = {a: {}}
  addrsyncIncludeExclude( // -- mount any rsync include or exclude files -------
      rsync_stack_configuration,
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
  // -- set rsync job ------------------------------------------------------
  const rsync_base_command = rsyncCommandString(
    rsync_constants.source_dir,
    rsync_constants.dest_dir,
    rsync_flags
  )

  const rsync_job_configuration = container_runtime.runner.emptyJobConfiguration(rsync_stack_configuration)
  rsync_job_configuration.remove_on_exit = true
  rsync_job_configuration.synchronous = true
  if(manual_copy)
    rsync_job_configuration.command = ['sh']
  else if(copy_options['chown'])
    rsync_job_configuration.command = [`${rsync_base_command} && chown -R ${copy_options['chown']}:${copy_options['chown']} ${rsync_constants.dest_dir}`]
  else
    rsync_job_configuration.command = [rsync_base_command]
  // -- start rsync job --------------------------------------------------------
  return new ValidatedOutput(true, undefined).absorb(
    container_runtime.runner.jobStart(
      rsync_job_configuration,
      'inherit'
    )
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
function rsyncStackConfiguration(runner: RunDriver, copy_options: RsyncOptions) : StackConfiguration
{
  const rsync_stack_configuration = runner.emptyStackConfiguration()

  rsync_stack_configuration.setImage(rsync_constants.image)
  if(copy_options["direction"] == "to-host")
  {
    rsync_stack_configuration.addVolume(copy_options["volume"], rsync_constants.source_dir)
    rsync_stack_configuration.addBind(copy_options["host-path"], rsync_constants.dest_dir)
  }
  else if(copy_options["direction"] == "to-volume")
  {
    rsync_stack_configuration.addVolume(copy_options["volume"], rsync_constants.dest_dir)
    rsync_stack_configuration.addBind(copy_options["host-path"], rsync_constants.source_dir)
  }
  return rsync_stack_configuration
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
export function setRelativeWorkDir(configuration: JobConfiguration<StackConfiguration>, hostRoot: string, hostDir: string = process.cwd())
{
  if(!hostRoot) return // should only be set if containerRoot is set
  const ced = containerWorkingDir(hostDir, hostRoot, configuration.stack_configuration.getContainerRoot())
  if(ced) configuration.working_directory = ced
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
      configuration.addEnvironmentVariable("DISPLAY", `host.docker.internal:${socket_number}`)
      const shell = new ShellCommand(explicit, false)
      shell.output("xhost +localhost", {}, []);
      break;
    case "linux": // == LINUX ==================================================
      configuration.addBind(X11_POSIX_BIND, X11_POSIX_BIND, {selinux: false})
      configuration.addEnvironmentVariable("DISPLAY", `$DISPLAY`)
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
export function addGenericLabels(configuration: JobConfiguration<StackConfiguration>, hostRoot: string, stack_path: string)
{
  if(hostRoot) configuration.addLabel(host_root_label, hostRoot)
  configuration.addLabel(container_root_label, configuration.stack_configuration.getContainerRoot())
  configuration.addLabel(stack_path_label, stack_path)
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
  const shell_result = trim(shell.output("xauth list $DISPLAY", {}, [], {}))
  if(shell_result.success) {
    const secret = shell_result.value.split("  ").pop(); // assume format: HOST  ACCESS-CONTROL  SECRET
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
export function scanForSettingsDirectory(dirpath: string):ValidatedOutput<ProjectSettings>
{
  var dirpath_parent = dirpath
  do {
    dirpath = dirpath_parent
    dirpath_parent = path.dirname(dirpath)
    // -- exit if settings file is invalid -------------------------------------
    const load_result = loadProjectSettings(dirpath)
    printResultState(load_result) // print any warnings if file is invalid
    if(load_result.success && load_result.value.get("project-root") == 'auto') {
      load_result.value.set({"project-root": dirpath})
      return load_result
    }
  } while(dirpath != dirpath_parent)

  return new ValidatedOutput(false, new ProjectSettings())
}

// -----------------------------------------------------------------------------
// LOADPROJECTSETTINGS: loads any project settings from the cjr dir in hostRoot
// -- Parameters ---------------------------------------------------------------
// hostRoot: string - project hostRoot
// -- Returns ------------------------------------------------------------------
// result: ValidatedOutput - result from file load
// project_settings: ProjectSettings
// -----------------------------------------------------------------------------
export function loadProjectSettings(project_root: string): ValidatedOutput<ProjectSettings>
{
  const project_settings = new ProjectSettings()
  const result = project_settings.loadFromFile(projectSettingsYMLPath(project_root))
  return new ValidatedOutput(true, project_settings).absorb(result)
}

// == Interactive Functions ====================================================

export async function promptUserForJobId(runner: RunDriver, stack_paths: Array<string>|undefined, states:Array<JobState>|undefined=undefined, silent: boolean = false)
{
  if(silent) return false;
  const job_info = runner.jobInfo({"stack-paths":stack_paths, "states": states})
  return await promptUserForId(job_info.value);
}

// helper function for promptUserForJobId & promptUserForResultId
export async function promptUserForId(id_info: Array<Dictionary>) : Promise<string>
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
      name: chalk`{italic ID}: ${JSTools.clipAndPad(j.id, 12, 15, true)} {italic COMMAND}: ${JSTools.clipAndPad(j.command, 20, 25, false)} {italic STATUS}: ${j.status}`,
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

export function ensureProjectId(hostRoot: string) : ValidatedOutput<string>
{
  if(!hostRoot) return new ValidatedOutput(false, "")
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

export function getProjectId(hostRoot: string) : ValidatedOutput<string>
{
  if(!hostRoot) return new ValidatedOutput(false, "")
  const proj_settings_abspath = projectSettingsDirPath(hostRoot)
  const file = new JSONFile(proj_settings_abspath, false)
  const result = file.read(project_idfile)
  if(result.success && result.value == "") // -- check if data is empty -----
    return new ValidatedOutput(false, "").pushError(
      ErrorStrings.PROJECTIDFILE.EMPTY(path.join(proj_settings_abspath, project_idfile))
    )
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
export async function jobToImage(runner: RunDriver, result: ValidatedOutput<string>, image_name: string, remove_job: boolean = false, interactive: boolean = false)
{
  if(result.success === false) return;
  const job_id = result.value
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
