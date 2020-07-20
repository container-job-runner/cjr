import chalk = require('chalk');
import path = require('path');
import fs = require('fs-extra')
import { JobRunOptions, ContainerDrivers, OutputOptions, JobExecOptions, JobCopyOptions, Configurations, JobDeleteOptions } from '../abstract/job-manager'
import { JobConfiguration } from '../../config/jobs/job-configuration';
import { ValidatedOutput } from '../../validated-output';
import { NewJobInfo, JobInfo, jobIds, JobState, } from '../../drivers-containers/abstract/run-driver';
import { label_strings } from '../../constants';
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
import { GenericJobManager } from '../abstract/generic-job-manager';

export type LocalJobManagerUserOptions = {
    "engine"?: "podman"|"docker"            // underlying container runner
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

export class LocalJobManager extends GenericJobManager
{
  options: Required<LocalJobManagerUserOptions> = {
      "engine": "docker", 
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
                "engine": this.options["engine"], 
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
                "engine": this.options["engine"],
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
    FAILED_START: chalk`{bold Failed to start job}`,
    JOBEXEC: {
      NO_PROJECTROOT : (id:string) => chalk`{bold No Associated Job Files:} job ${id} has no associated project root. Exec is not possible in this job.`,
      NO_PARENT_VOLUME : (id: string) => chalk`{bold No Associated File Volume:} job ${id} has no associated file volume. Exec is not possible in this job.`
    }
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
    COPY :   "rsync Output: Volume to Host",
    START : "Job Output",
    JOB_ID : "Job Id"
  }

  protected failed_nji:NewJobInfo = {"id": "", "exit-code": 0, "output": ""} // value that will be returned if start or exec fail

  run(job_configuration: JobConfiguration<StackConfiguration<any>>, job_options: JobRunOptions) : ValidatedOutput<NewJobInfo>
  {
    const failed_result = new ValidatedOutput(false, this.failed_nji);

    const stack_configuration = job_configuration.stack_configuration
    // -- 1. build stack and load stack configuration ---------------------------
    this.printStatus({"header": this.STATUSHEADERS.BUILD})
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
      this.printStatus({header: this.STATUSHEADERS.COPY_TO_VOLUME})
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
    
    return super.run(job_configuration, job_options)
  }

  protected configureExecFileMounts(job_configuration: JobConfiguration<StackConfiguration<any>>, exec_options: JobExecOptions, parent_job: JobInfo) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    const parent_file_volume_id = parent_job.labels?.[label_strings.job["file-volume"]] || ""
    const parent_project_root = parent_job.labels?.[label_strings.job["project-root"]] || ""
    if(!parent_project_root)
      return result.pushError(this.ERRORSTRINGS.JOBEXEC.NO_PROJECTROOT(parent_job.id))
    if(!parent_file_volume_id)
      return result.pushError(this.ERRORSTRINGS.JOBEXEC.NO_PARENT_VOLUME(parent_job.id))

    mountFileVolume(job_configuration.stack_configuration, parent_project_root, parent_file_volume_id)
    return result
  }

  copyJob(job: JobInfo, copy_options: JobCopyOptions) : ValidatedOutput<undefined>
  {
      const result = new ValidatedOutput(true, undefined)
      // -- 1. extract label information ---------------------------------------
      const id = job.id;
      const projectRoot = job.labels?.[label_strings.job["project-root"]] || ""
      const file_volume_id = job.labels?.[label_strings.job["file-volume"]] || ""
      const download_exclude = job.labels?.[label_strings.job["download-exclude"]] || ""
      const download_include = job.labels?.[label_strings.job["download-include"]] || ""
      if(!projectRoot) return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_PROJECTROOT(id))
      if(!file_volume_id) return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_VOLUME(id))
      // -- 2. write include & exclude settings to files -------------------------
      let rsync_rules:{include?: string[], exclude?: string[]} = {}
      if(!copy_options["all-files"]) {
        rsync_rules['include'] = this.includeExcludeLabelToFlag(download_include)
        rsync_rules['exclude'] = this.includeExcludeLabelToFlag(download_exclude)
      }
      // -- 3. copy files ------------------------------------------------------
      const rsync_options: VolumeRsyncOptions = {
        "host-path": copy_options?.["host-path"] || projectRoot, // set copy-path to job hostRoot if it's not specified
        "volume": file_volume_id,
        "mode": copy_options.mode,
        "verbose": this.output_options.verbose,
        "rules": rsync_rules,
        "manual": copy_options["manual"]
      }
      result.absorb(
        this.sync_manager.copyToHost(this, rsync_options)
      )

      return result
  }

  protected deleteJob(job: JobInfo, options: JobDeleteOptions) : ValidatedOutput<undefined>
  {
    const result = super.deleteJob(job, options)
    // -- remove any associated file volumes -----------------------------------    
    const file_volume = job.labels?.[label_strings.job["file-volume"]]
    if(!file_volume) return result

    const volume_delete = this.container_drivers.runner.volumeDelete([file_volume])
    result.absorb(volume_delete)
    if(this.output_options.verbose && volume_delete.success)
        console.log(` deleted volume ${file_volume}.`)

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
