import chalk = require('chalk');
import path = require('path');
import fs = require('fs-extra')
import { JobManager, JobRunOptions, ContainerDrivers, OutputOptions, JobExecOptions, JobCopyOptions, Configurations, JobDeleteOptions, JobStopOptions, JobStateOptions, JobAttachOptions, JobLogOptions, JobListOptions, JobBuildOptions } from '../abstract/job-manager'
import { JobConfiguration } from '../../config/jobs/job-configuration';
import { ValidatedOutput } from '../../validated-output';
import { firstJob, NewJobInfo, JobInfo, jobIds, JobState, firstJobId } from '../../drivers-containers/abstract/run-driver';
import { Dictionary, rsync_constants, label_strings } from '../../constants';
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';
import { addX11, setRelativeWorkDir, addGenericLabels, bindProjectRoot, mountFileVolume } from '../../functions/config-functions';
import { ShellCommand } from '../../shell-command';
import { FileTools } from '../../fileio/file-tools';
import { DockerCliRunDriver } from '../../drivers-containers/docker/docker-cli-run-driver';
import { DockerSocketRunDriver } from '../../drivers-containers/docker/docker-socket-run-driver';
import { trim } from '../../functions/misc-functions';
import { TextFile } from '../../fileio/text-file';
import { JSTools } from '../../js-tools';
import { DriverInitSocket } from './driver-init-socket';
import { DriverInitCli } from './driver-init-cli';
import { VolumeSyncManager, VolumeRsyncOptions } from '../../sync-managers/volume-sync-manager';

type IncludeExcludeFiles = {
  "include-from"?: string
  "exclude-from"?: string
  "tmp-dir"?: string
}

export type LocalJobManagerUserOptions = {
    "driver"?: "podman"|"docker"            // underlying container runner
    "driver-type"?: "cli"|"socket"          // once cli driver are depricated this field can be removed
    "output-options"?: OutputOptions    
    "selinux"?: boolean                     // if true, then bind mounts will have selinux :Z mode
    "socket"?: string                       // path to socket
    "image-tag"?: string                    // tag that will be used for all container images
    "explicit"?: boolean
    "directories": {
        "copy": string                      // directory path for storing temporary rsync include-from and exclude-from files during copy operations from volumes
        "build": string                     // directory path for storing temporary tar files that are sent to socket for building.
    }
}

export class LocalJobManager extends JobManager
{
  options: Required<LocalJobManagerUserOptions> = {
      "driver": "docker", 
      "driver-type": "socket", 
      "output-options": {"quiet": false, "verbose": false},
      "selinux": false,
      "image-tag": 'cjr',
      "socket": "/var/run/docker.sock",
      "explicit": false,
      "directories": {
          "copy": "",
          "build": ""
      }
  }
  shell: ShellCommand
  container_drivers: ContainerDrivers
  configurations: Configurations
  output_options: OutputOptions
  sync_manager: VolumeSyncManager = new VolumeSyncManager()

  constructor(options: LocalJobManagerUserOptions)
  {
    super()
    JSTools.rMerge(this.options, options)
    
    const shell = new ShellCommand(
        this.options.explicit, 
        this.options["output-options"].quiet
    )
    
    if(options["driver-type"] == "socket") {
        const initializer = new DriverInitSocket()
        this.container_drivers = initializer.drivers(
            shell,
            {
                "type": this.options["driver"], 
                "socket": this.options["socket"],
                "selinux": this.options["selinux"],
                "build-directory": this.options["directories"]['build'], 
            }
        )
        this.configurations = initializer.configurations({
            "image-tag": this.options["image-tag"]
        })
    } 
    else { // once cli driver are depricated this case can be removed
        const initializer = new DriverInitCli()
        this.container_drivers = initializer.drivers(
            shell,
            {
                "type": this.options["driver"],
                "selinux": this.options["selinux"]
            }            
        )
        this.configurations = initializer.configurations({
            "image-tag": this.options["image-tag"]
        });
    }
    
    this.output_options = this.options["output-options"]
    this.shell = shell
  }

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

  run(job_configuration: JobConfiguration<StackConfiguration<any>>, job_options: JobRunOptions) : ValidatedOutput<NewJobInfo>
  {
    const failed_result = new ValidatedOutput(false, this.failed_nji);

    const stack_configuration = job_configuration.stack_configuration
    // -- 1. build stack and load stack configuration ---------------------------
    this.printStatus({"header": this.STATUSHEADERS.BUILD}, this.output_options)
    const build_result = this.build(
      job_configuration.stack_configuration,
      {"reuse-image": job_options['reuse-image']}
    )
    if(!build_result.success) return failed_result.absorb(build_result)
    // -- 2. mount project files ------------------------------------------------
    if(job_options["project-root"] && job_options["project-root-file-access"] === "bind")
      bindProjectRoot(stack_configuration, job_options["project-root"])
    else if(job_options["project-root"] && job_options["project-root-file-access"] === "volume")
    {
      this.printStatus({header: this.STATUSHEADERS.COPY_TO_VOLUME}, this.output_options)
      const create_file_volume = this.createNewFileVolume(
          job_options['project-root'], 
          stack_configuration.getRsyncUploadSettings(true),
          this.volumeChownId(stack_configuration.getFlag('chown-file-volume')) // special volume chown for docker
      )
      if(!create_file_volume.success)
        return failed_result.absorb(create_file_volume)
      
      const file_volume_id = create_file_volume.value
      mountFileVolume(stack_configuration, job_options["project-root"], file_volume_id)
      job_configuration.addLabel(label_strings.job["file-volume"], file_volume_id)
    }
    // -- 1. update job properties: apply options --------------------------------
    setRelativeWorkDir(job_configuration, job_options["project-root"] || "", job_options["cwd"])
    addGenericLabels(job_configuration, job_options["project-root"] || "")
    if(job_options.x11)
      addX11(job_configuration)
    // -- 3. start job -----------------------------------------------------------
    this.printStatus({"header": this.STATUSHEADERS.START}, this.output_options)
    const job = this.container_drivers.runner.jobStart(
      job_configuration,
      job_configuration.synchronous ? 'inherit' : 'pipe'
    )
    // -- print id ---------------------------------------------------------------
    if(!job.success) job.pushError(this.ERRORSTRINGS.FAILED_START)
    else this.printStatus({header: this.STATUSHEADERS.JOB_ID, message: job.value.id}, this.output_options)
    return job
  }

  exec(job_configuration: JobConfiguration<StackConfiguration<any>>, exec_options: JobExecOptions) : ValidatedOutput<NewJobInfo>
  {
    const failed_result = new ValidatedOutput(false, this.failed_nji);

    // -- get parent job information -------------------------------------------
    const job_info_request = firstJob(
      this.container_drivers.runner.jobInfo({
        "ids": [exec_options["parent-id"]],
        "stack-paths": exec_options["stack-paths"]
      })
    )
    if(!job_info_request.success)
      return failed_result.absorb(job_info_request).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
    const parent_job_info = job_info_request.value
    // -- extract parent-job hostRoot and file_volume_id -----------------------
    const parent_project_root = parent_job_info.labels?.[label_strings.job["project-root"]] || ""
    const parent_file_volume_id = parent_job_info.labels?.[label_strings.job["file-volume"]] || ""
    if(!parent_project_root)
      return failed_result.pushWarning(this.WARNINGSTRINGS.JOBEXEC.NO_PROJECTROOT(parent_job_info.id))
    // -- configure job & stack properties --------------------------------------
    setRelativeWorkDir(job_configuration, parent_project_root, exec_options["cwd"])
    job_configuration.addLabel(label_strings.job["parent-job-id"], parent_job_info.id)
    job_configuration.addLabel(label_strings.job["type"], "exec")
    job_configuration.remove_on_exit = true
    if(exec_options.x11)
      addX11(job_configuration)
    const stack_configuration = job_configuration.stack_configuration
    if(parent_file_volume_id) // -- bind parent job volume ----------------------
      mountFileVolume(stack_configuration, parent_project_root, parent_file_volume_id)  // check with run options.
    else // -- bind parent job hostRoot -----------------------------------------
      bindProjectRoot(stack_configuration, parent_project_root)
    // -- start job -------------------------------------------------------------
    return this.buildAndRun(
      job_configuration,
      {"reuse-image": exec_options["reuse-image"]}
    )
  }

  copy(copy_options: JobCopyOptions) : ValidatedOutput<undefined>
  {
    this.printStatus({header: this.STATUSHEADERS.COPY_TO_HOST}, this.output_options)
    const result = new ValidatedOutput(true, undefined);
    // -- get information on all matching jobs -----------------------------------
    var ji_result = this.container_drivers.runner.jobInfo({
      "ids": copy_options['ids'],
      "stack-paths": copy_options["stack-paths"]
    })
    if(!ji_result.success) return result.absorb(ji_result)
    if(ji_result.value.length == 0) return result.pushError(this.ERRORSTRINGS['NO_MATCHING_ID'])
    const job_info_array = ji_result.value
    // -- copy results from all matching jobs ------------------------------------
    job_info_array.map((job:JobInfo) => {
      // -- 1. extract label information -----------------------------------------
      const id = job.id;
      const projectRoot = job.labels?.[label_strings.job["project-root"]] || ""
      const file_volume_id = job.labels?.[label_strings.job["file-volume"]] || ""
      const download_exclude = job.labels?.[label_strings.job["download-exclude"]] || ""
      const download_include = job.labels?.[label_strings.job["download-include"]] || ""
      if(!projectRoot) return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_PROJECTROOT(id))
      if(!file_volume_id) return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_VOLUME(id))
      // -- 2. write include & exclude settings to files -------------------------
      let rsync_files:IncludeExcludeFiles = {}
      if(!copy_options["all-files"]) {
        const write_request = this.writeDownloadIncludeExcludeFiles(download_include, download_exclude)
        rsync_files = write_request.value
        if(!write_request.success) {
          if(rsync_files["tmp-dir"]) fs.removeSync(rsync_files["tmp-dir"])
          return result.absorb(write_request)
        }
      }
      // -- 3. copy files --------------------------------------------------------
      const rsync_options: VolumeRsyncOptions = {
        "host-path": copy_options?.["host-path"] || projectRoot, // set copy-path to job hostRoot if it's not specified
        "volume": file_volume_id,
        "mode": copy_options.mode,
        "verbose": this.output_options.verbose,
        "files": {"include": rsync_files["include-from"], "exclude": rsync_files["exclude-from"]},
        "manual": copy_options["manual"]
      }
      result.absorb(
        this.sync_manager.copyToHost(this, rsync_options)
      )
      // -- 4. remote tmp dir ----------------------------------------------------
      if(rsync_files["tmp-dir"])
        fs.removeSync(rsync_files["tmp-dir"])
    })
    return result
  }

  protected printStatus(contents: {header: string, message?: string}, output_options: OutputOptions, line_width:number = 80) {
    if(output_options.quiet || !output_options.verbose) return
    console.log(chalk`-- {bold ${contents.header}} ${'-'.repeat(Math.max(0,line_width - contents.header.length - 4))}`)
    if(contents?.message) console.log(contents.message)
  }

  delete(options: JobDeleteOptions) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    const job_info = this.jobSelector(this.container_drivers, options)
    if(!job_info.success)
      return new ValidatedOutput(false, undefined)
    if(job_info.value.length == 0)
      return new ValidatedOutput(false, undefined).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)

    const job_ids = jobIds(job_info).value
    const volume_ids = volumeIds(job_info).value

    if(!this.output_options.verbose)
      return result.absorb(
        this.container_drivers.runner.jobDelete(job_ids),
        this.container_drivers.runner.volumeDelete(volume_ids)
      )

    // -- delete jobs ----------------------------------------------------
    job_ids.map( (id:string) => {
      const delete_result = this.container_drivers.runner.jobDelete([id])
      result.absorb(delete_result)
      if(delete_result.success)
        console.log(` deleted job ${id}.`)
    })
    // -- delete volumes -------------------------------------------------
    volume_ids.map( (id:string) => {
      const delete_result = this.container_drivers.runner.volumeDelete([id])
      result.absorb(delete_result)
      if(delete_result.success)
        console.log(` deleted volume ${id}.`)
    })
    return result
  }

  stop(options: JobStopOptions) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    const job_info = this.jobSelector(this.container_drivers, options)
    if(!job_info.success)
      return new ValidatedOutput(false, undefined)
    if(job_info.value.length == 0)
      return new ValidatedOutput(false, undefined).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)

    const job_ids = jobIds(job_info).value

    if(!this.output_options.verbose)
      return result.absorb(
        this.container_drivers.runner.jobStop(job_ids)
      )

    // -- stop jobs ----------------------------------------------------
    job_ids.map( (id:string) => {
      const delete_result = this.container_drivers.runner.jobDelete(job_ids)
      result.absorb(delete_result)
      if(delete_result.success)
        console.log(` stopped job ${id}.`)
    })
    return result
  }

  state(options: JobStateOptions) : ValidatedOutput<JobState[]>
  {
    return jobStates(
      this.container_drivers.runner.jobInfo({
        'ids': options["ids"],
        'stack-paths': options["stack-paths"]
      })
    )
  }

  attach(options: JobAttachOptions) : ValidatedOutput<undefined>
  {
    // match with existing container ids
    const result = firstJobId(
      this.container_drivers.runner.jobInfo({
        "ids": [options['id']],
        "stack-paths": options['stack-paths'],
        "states": ["running"]
      }))
    if(result.success)
      return this.container_drivers.runner.jobAttach(result.value)
    else
      return new ValidatedOutput(false, undefined).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
  }

  log(options: JobLogOptions) : ValidatedOutput<string>
  {
    // match with existing container ids
    const result = firstJobId(
      this.container_drivers.runner.jobInfo({
        "ids": [options['id']],
        "stack-paths": options['stack-paths']
      }))
    if(result.success)
      return this.container_drivers.runner.jobLog(result.value, options["lines"])
    else
      return new ValidatedOutput(false, "").pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
  }

  list(options: JobListOptions) : ValidatedOutput<JobInfo[]>
  {
    return this.container_drivers.runner.jobInfo(options.filter)  
  }

  build(stack_configuration: StackConfiguration<any>, build_options: JobBuildOptions) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    if(build_options["reuse-image"] && this.container_drivers.builder.isBuilt(stack_configuration))
        return result
    else
        return result.absorb(
            this.container_drivers.builder.build(
                stack_configuration, 
                (this.output_options.verbose || build_options?.verbose) ? "inherit" : "pipe", 
                build_options
            )
        )
  }

  private buildAndRun(job_configuration: JobConfiguration<StackConfiguration<any>>, build_options: JobBuildOptions)
  {    
    const failed_result = new ValidatedOutput(false, {"id": "", "exit-code": 0, "output": ""});
    const build_result = this.build(job_configuration.stack_configuration, build_options)
    if(!build_result.success)
        return failed_result
    return this.container_drivers.runner.jobStart(job_configuration, job_configuration.synchronous ? 'inherit' : 'pipe')
  }

  private jobSelector(container_drivers: ContainerDrivers, options: JobStopOptions|JobDeleteOptions) : ValidatedOutput<JobInfo[]>
  {
    let job_info: ValidatedOutput<JobInfo[]>
    if(options.selecter == "all") // -- delete all jobs ----------------------------------------
      job_info = container_drivers.runner.jobInfo({
        'stack-paths': options['stack-paths']
      })
    else if(options.selecter == "all-exited") // -- delete all jobs ----------------------------
      job_info = container_drivers.runner.jobInfo({
        'stack-paths': options['stack-paths'],
        'states': ["exited"]
      })
    else if(options.selecter == "all-running")
      job_info = container_drivers.runner.jobInfo({
        'stack-paths': options['stack-paths'],
        'states': ["running"]
      })
    else  // -- remove only specific jobs ------------------------------------------------------
      job_info = container_drivers.runner.jobInfo({
        'ids': options['ids'],
        'stack-paths': options['stack-paths']
      })
    return job_info
  }

  // creates files for rsync --include-from and --excluded from that are used when copying from volume back to host

  private writeDownloadIncludeExcludeFiles(include_label: string|undefined, exclude_label: string|undefined) : ValidatedOutput<IncludeExcludeFiles>
  {
    const result:ValidatedOutput<IncludeExcludeFiles> = new ValidatedOutput(true, {})
    if(!include_label && !exclude_label)
      return result

    // -- create tmp dir in scratch dir ----------------------------------------
    const mktemp = FileTools.mktempDir(this.options.directories["copy"])
    if(!mktemp.success)
      return result.absorb(mktemp)
    const tmp_path = mktemp.value
    result.value["tmp-dir"] = tmp_path

    // -- write files ----------------------------------------------------------
    const author = new TextFile()
    author.add_extension = false

    type FI = {path: string, data?: string, key: keyof IncludeExcludeFiles}
    const file_info: Array<FI> = [
      {key: 'include-from', path: path.join(tmp_path, "download_include"), data: include_label},
      {key: 'exclude-from', path: path.join(tmp_path, "download_exclude"), data: exclude_label}
    ]

    file_info.map( (f:FI) => {
      if(!f.data) return
      result.absorb(author.write(f.path, f.data))
      if(!result.success) result.pushError(`Failed to write file ${f.path}`)
      result.value[f.key] = f.path
    })

    return result
  }

  private createNewFileVolume(host_root: string, include_exclude_files: {include: string, exclude: string}, chown_id?:string) : ValidatedOutput<string>
  {
    const failure = new ValidatedOutput(false, "")
    // -- create volume --------------------------------------------------------
    const vc_result = this.container_drivers.runner.volumeCreate({});
    if(!vc_result.success) return failure.absorb(vc_result)
    const volume_id = vc_result.value
    // -- sync to volume -------------------------------------------------------
    const copy_options: VolumeRsyncOptions = {
        "host-path": host_root,
        "volume":    volume_id,
        "mode":      "mirror",
        "verbose":   this.output_options.verbose,
        "files":     include_exclude_files,
        "chown":     chown_id
    }
    // -- sync files to volume -------------------------------------------------
    return new ValidatedOutput(true, volume_id).absorb(
        this.sync_manager.copyFromHost(this, copy_options)
    )
  }

  // -- check if runtime is docker and chownvolume flags is active -------------
  private volumeChownId(chown_file_volume_flag: string|undefined) : string | undefined
  {
    if( ! chown_file_volume_flag )
        return undefined
    
    // -- this setting only affects docker -------------------------------------
    // (volumes always owned by root https://github.com/moby/moby/issues/2259)
    const using_docker = (this.container_drivers.runner instanceof DockerCliRunDriver) || (this.container_drivers.runner instanceof DockerSocketRunDriver)
    if( ! using_docker )
        return undefined
    
    // -- if flag is set to 'host-user' replace with current user id -----------
    if( chown_file_volume_flag === 'host-user' ) {
        const id_result = trim(new ShellCommand(false, false).output('id', {u:{}}, [], {}))
        if(!id_result.success) return undefined
        chown_file_volume_flag = id_result.value
    }

    // -- verify flag is a valid integer ---------------------------------------
    if ( isNaN(parseInt(chown_file_volume_flag)) )
        return undefined
    return chown_file_volume_flag
  }

}

function volumeIds(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<Array<string>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true,
    job_info.value
    .map((ji:JobInfo) => ji.labels?.[label_strings.job["file-volume"]] || "")
    .filter((s:string) => s !== "")
  )
}

function jobStates(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<Array<JobState>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true,
    job_info.value.map( ( job:JobInfo ) => job.state)
  )
}
