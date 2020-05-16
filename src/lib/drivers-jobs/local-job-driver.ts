import chalk = require('chalk');
import path = require('path');
import { JobDriver, JobRunOptions, ContainerDrivers, OutputOptions, JobExecOptions, JobCopyOptions, Configurations } from './job-driver'
import { JobConfiguration } from '../config/jobs/job-configuration';
import { ValidatedOutput } from '../validated-output';
import { firstJob, RunDriver, NewJobInfo } from '../drivers-containers/abstract/run-driver';
import { file_volume_label, Dictionary, rsync_constants, project_root_label, stack_path_label } from '../constants';
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration';
import { addX11, setRelativeWorkDir, addGenericLabels, bindProjectRoot } from '../functions/config-functions';
import { ShellCommand } from '../shell-command';
import { FileTools } from '../fileio/file-tools';
import { DockerCliRunDriver } from '../drivers-containers/docker/docker-cli-run-driver';
import { DockerSocketRunDriver } from '../drivers-containers/docker/docker-socket-run-driver';
import { trim } from '../functions/misc-functions';
import { buildAndRun, buildImage } from '../functions/build-functions';
import { loadProjectSettings } from '../functions/run-functions';

export class LocalJobDriver extends JobDriver
{

  protected ERRORSTRINGS = {
    NO_MATCHING_ID: chalk`{bold No Matching Job ID}`,
    FAILED_START: chalk`{bold Failed to start job}`
  }

  protected WARNINGSTRINGS = {
    JOBEXEC: {
      NO_VOLUME : (id:string) => chalk`{bold No Associated Job File volume:} job ${id} has no associated volume; job:exec and job:shell can only be used on jobs that where started with --file-access=volume`,
      NO_PROJECTROOT : (id:string) => chalk`{bold No Associated Job Files:} job ${id} has no associated project root. Exec is not possible in this job`
    },
    JOBCOPY: {
      NO_VOLUME : (id:string) => chalk`{bold No Copy Required:} job ${id} has no associated volume.`,
      NO_PROJECTROOT : (id:string) => chalk`{bold No Copy Required:} job ${id} has no associated project root.`
    }
  }

  protected STATUSHEADERS = {
    BUILD : "Build Output",
    COPY_TO_VOLUME : "rsync Output: Host to Volume",
    COPY_TO_HOST :   "rsync Output: Volume to Host",
    START : "Job Output",
    JOB_ID : "Job Id"
  }

  protected failed_nji:NewJobInfo = {"id": "", "exit-code": 0, "output": ""} // value that will be returned if start or exec fail

  run(job_configuration: JobConfiguration<StackConfiguration<any>>, drivers: ContainerDrivers, config: Configurations, output_options: OutputOptions, job_options: JobRunOptions) : ValidatedOutput<NewJobInfo>
  {
    const failed_result = new ValidatedOutput(false, this.failed_nji);

    const stack_configuration = job_configuration.stack_configuration
    // -- 1. build stack and load stack configuration ---------------------------
    this.printStatus({"header": this.STATUSHEADERS.BUILD}, output_options)
    const build_result = buildImage(job_configuration.stack_configuration, drivers, {"reuse-image": job_options['reuse-image'], "verbose": output_options.verbose})
    if(!build_result.success) return failed_result.absorb(build_result)
    // -- 2. mount project files ------------------------------------------------
    if(job_options["project-root"] && job_options["project-root-file-access"] === "bind")
      bindProjectRoot(stack_configuration, job_options["project-root"])
    else if(job_options["project-root"] && job_options["project-root-file-access"] === "volume")
    {
      this.printStatus({header: this.STATUSHEADERS.COPY_TO_VOLUME}, output_options)
      const create_file_volume = createFileVolume(drivers, config, stack_configuration, job_options["project-root"], output_options.verbose)
      if(!create_file_volume.success) return failed_result.absorb(create_file_volume)
      const file_volume_id = create_file_volume.value
      mountFileVolume(stack_configuration, job_options["project-root"], file_volume_id)
      job_configuration.addLabel(file_volume_label, file_volume_id)
    }
    // -- 1. update job properties: apply options --------------------------------
    setRelativeWorkDir(job_configuration, job_options["project-root"] || "", job_options["cwd"])
    addGenericLabels(job_configuration, job_options["project-root"] || "")
    // -- 3. start job -----------------------------------------------------------
    this.printStatus({"header": this.STATUSHEADERS.START}, output_options)
    const job = drivers.runner.jobStart(job_configuration, job_configuration.synchronous ? 'inherit' : 'pipe')
    // -- print id ---------------------------------------------------------------
    if(!job.success) job.pushError(this.ERRORSTRINGS.FAILED_START)
    else this.printStatus({header: this.STATUSHEADERS.JOB_ID, message: job.value.id}, output_options)
    return job
  }

  exec(job_configuration: JobConfiguration<StackConfiguration<any>>, drivers: ContainerDrivers, output_options: OutputOptions, exec_options: JobExecOptions) : ValidatedOutput<NewJobInfo>
  {
    const failed_result = new ValidatedOutput(false, this.failed_nji);

    // -- get parent job information -------------------------------------------
    const job_info_request = firstJob(
      drivers.runner.jobInfo({"ids": [exec_options["parent-id"]]})
    )
    if(!job_info_request.success)
      return failed_result.absorb(job_info_request).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
    const parent_job_info = job_info_request.value
    // -- extract parent-job hostRoot and file_volume_id -----------------------
    const parent_project_root = parent_job_info.labels?.[project_root_label] || ""
    const parent_file_volume_id = parent_job_info.labels?.[file_volume_label] || ""
    if(!parent_project_root)
      return failed_result.pushWarning(this.WARNINGSTRINGS.JOBEXEC.NO_PROJECTROOT(parent_job_info.id))
    // -- configure job & stack properties --------------------------------------
    setRelativeWorkDir(job_configuration, parent_project_root, exec_options["cwd"])
    if(exec_options.x11)
      addX11(job_configuration, drivers)
    const stack_configuration = job_configuration.stack_configuration
    if(parent_file_volume_id) // -- bind parent job volume ----------------------
      mountFileVolume(stack_configuration, parent_project_root, parent_file_volume_id)  // check with run options.
    else // -- bind parent job hostRoot -----------------------------------------
      bindProjectRoot(stack_configuration, parent_project_root)
    // -- start job -------------------------------------------------------------
    return buildAndRun(job_configuration, drivers, {
      "reuse-image": exec_options["reuse-image"],
      "verbose": output_options.verbose
    })
  }

  copy(drivers: ContainerDrivers, config: Configurations, output_settings: OutputOptions, copy_options: JobCopyOptions) : ValidatedOutput<undefined>
  {
    this.printStatus({header: this.STATUSHEADERS.COPY_TO_HOST}, output_settings)
    const result = new ValidatedOutput(true, undefined);
    // -- get information on all matching jobs -----------------------------------
    var ji_result = drivers.runner.jobInfo({
      "ids": copy_options['ids'],
      "stack-paths": copy_options["stack-paths"] || undefined
    })
    if(!ji_result.success) return result.absorb(ji_result)
    const job_info_array = ji_result.value
    // -- copy results from all matching jobs ------------------------------------
    job_info_array.map((job:Dictionary) => {
      // -- 1. extract label information -----------------------------------------
      const id = job.id;
      const projectRoot = job.labels?.[project_root_label] || ""
      const file_volume_id = job.labels?.[file_volume_label] || ""
      const stack_path = job.labels?.[stack_path_label] || ""
      const host_path  = copy_options?.["host-path"] || projectRoot // set copy-path to job hostRoot if it's not specified
      if(!projectRoot) return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_PROJECTROOT(id))
      if(!file_volume_id) return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_VOLUME(id))
      // -- 2. load stack configuration & get download settings ------------------
      const load_result = loadProjectSettings(host_path) // check settings in copy path (not hostRoot) in case user wants to copy into folder that is not hostRoot
      const configuration = config.stack()
      configuration.load(stack_path, (load_result.value.get('config-files') as Array<string>) || [])
      // -- 3. copy files --------------------------------------------------------
      const rsync_options: RsyncOptions = {
        "host-path": host_path,
        "volume": file_volume_id,
        "direction": "to-host",
        "mode": copy_options.mode,
        "verbose": output_settings.verbose,
        "files": configuration.getRsyncDownloadSettings(true)
      }
      result.absorb(syncHostDirAndVolume(drivers, config, rsync_options, copy_options?.manual || false))
    })
    return result
  }

  protected printStatus(contents: {header: string, message?: string}, output_options: OutputOptions, line_width:number = 80) {
    if(output_options.quiet || !output_options.verbose) return
    console.log(chalk`-- {bold ${contents.header}} ${'-'.repeat(Math.max(0,line_width - contents.header.length - 4))}`)
    if(contents?.message) console.log(contents.message)
  }

}

// == FILE VOLUME FUNCTIONS ====================================================
// Function for creating and manipulating volumes that contain copies of a jobs
// project-root.
// =============================================================================

// -- used by functions jobCopy and syncHostDirAndVolume
export type RsyncOptions = {
  "host-path": string                                                           // path on host where files should be copied to
  "volume": string                                                              // id of volume that contains files
  "direction": "to-volume"|"to-host"                                            // specifies direction of sync
  "mode": "update"|"overwrite"|"mirror"                                         // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  "verbose"?: boolean                                                           // if true rsync will by run with -v flag
  "files"?: {include: string, exclude: string}                                  // rsync include-from and rsync exclude-from
  "chown"?: string                                                              // string that specifies the username or id to use with command chown
  "manual"?: boolean                                                            // if true starts interactive shell instead of rsync job
}

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
export function createFileVolume(drivers: ContainerDrivers, config: Configurations, stack_configuration: StackConfiguration<any>, hostRoot: string, verbose: boolean=false) : ValidatedOutput<string>
{
  const failure = new ValidatedOutput(false, "")
  // -- create volume ----------------------------------------------------------
  const vc_result = drivers.runner.volumeCreate({});
  if(!vc_result.success) return failure.absorb(vc_result)
  const volume_id = vc_result.value
  // -- sync to volume ---------------------------------------------------------
  const copy_options: RsyncOptions = {
    "host-path": hostRoot,
    "volume": volume_id,
    "direction": "to-volume",
    "mode": "mirror",
    "verbose": verbose,
    "files": stack_configuration.getRsyncUploadSettings(true)
  }
  // -- check if runtime is docker and chownvolume flags is active -------------
  const cfv = stack_configuration.getFlags()?.['chown-file-volume'];
  const using_docker = (drivers.runner instanceof DockerCliRunDriver) || (drivers.runner instanceof DockerSocketRunDriver)
  if( using_docker && (cfv === 'host-user') ) {
    const id_result = trim(new ShellCommand(false, false).output('id', {u:{}}, [], {}))
    if(id_result.success && id_result.value) copy_options.chown = id_result.value
  }
  else if ( using_docker && !isNaN(parseInt(cfv))) {
    copy_options.chown = cfv
  }
  // -- sync files to volume ---------------------------------------------------
  return new ValidatedOutput(true, volume_id).absorb(
    syncHostDirAndVolume(drivers, config, copy_options)
  )
}

// -----------------------------------------------------------------------------
// MOUNTFILEVOLUME mounts a volume at containerRoot with name of hostRoot
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner used to create volume
// configuration:Configuration - Object that inherits from abstract class Configuration
// hostRoot:string - Project root folder
// volume_id:string - volume id
// -----------------------------------------------------------------------------
export function mountFileVolume(stack_configuration: StackConfiguration<any>, hostRoot: string, volume_id: string)
{
  const hostRoot_basename = path.basename(hostRoot)
  stack_configuration.addVolume(volume_id, path.posix.join(stack_configuration.getContainerRoot(), hostRoot_basename))
}

// -----------------------------------------------------------------------------
// SYNCHOSTDIRANDVOLUME uses rsync to sync a folder on host with a volume
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner that is used to start rsync job
// copy_options: string - options for file sync
// -----------------------------------------------------------------------------
export function syncHostDirAndVolume(drivers: ContainerDrivers, config: Configurations, copy_options:RsyncOptions, manual_copy:boolean = false) : ValidatedOutput<undefined>
{
  const result = new ValidatedOutput(true, undefined)

  if(!copy_options["host-path"]) return result
  if(!copy_options["volume"]) return result
  // -- create stack configuration for rsync job -------------------------------
  const rsync_stack_configuration = rsyncStackConfiguration(drivers.runner, config, copy_options)
  // -- ensure rsync container is built ----------------------------------------
  if(!drivers.builder.isBuilt(rsync_stack_configuration)) {
    result.absorb(
      drivers.builder.build(rsync_stack_configuration, copy_options.verbose ? "inherit" : "pipe")
    )
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

  const rsync_job_configuration = config.job(rsync_stack_configuration)
  rsync_job_configuration.remove_on_exit = true
  rsync_job_configuration.synchronous = true
  if(copy_options['manual'])
    rsync_job_configuration.command = ['sh']
  else if(copy_options['chown'])
    rsync_job_configuration.command = [`${rsync_base_command} && chown -R ${copy_options['chown']}:${copy_options['chown']} ${rsync_constants.dest_dir}`]
  else
    rsync_job_configuration.command = [rsync_base_command]
  // -- start rsync job --------------------------------------------------------
  return new ValidatedOutput(true, undefined).absorb(
    drivers.runner.jobStart(
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
function rsyncStackConfiguration(runner: RunDriver, config:Configurations, copy_options: RsyncOptions) : StackConfiguration<any>
{
  const rsync_stack_configuration = config.stack()

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
function addrsyncIncludeExclude(rsync_configuration: StackConfiguration<any>, rsync_flags: Dictionary, files: {include: string, exclude: string})
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
