import { JobConfiguration } from "../../config/jobs/job-configuration";
import { ValidatedOutput } from '../../validated-output';
import { RunDriver, NewJobInfo, JobState, JobInfoFilter, JobInfo } from '../../drivers-containers/abstract/run-driver';
import { BuildDriver } from '../../drivers-containers/abstract/build-driver';
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';
import { ExecConfiguration, ExecConstructorOptions } from '../../config/exec/exec-configuration';
import { ShellCommand } from '../../shell-command';
import { SshShellCommand } from '../../ssh-shell-command';

export type ContainerDrivers = {
  "runner": RunDriver
  "builder": BuildDriver
}

export type Configurations = {
  "stack": () => StackConfiguration<any>
  "job": (stack_configuration?:StackConfiguration<any>) => JobConfiguration<any>,
  "exec": (options?:ExecConstructorOptions) => ExecConfiguration
}

export type OutputOptions = {
  "verbose": boolean
  "quiet": boolean
}

export type JobRunOptions = {
  "reuse-image": boolean
  "project-root-file-access": "volume"|"shared"
  "project-root"?: string
  "cwd"?: string
  "x11"?: boolean
}

export type JobExecOptions = {
  "reuse-image": boolean
  "cwd"?: string
  "parent-id": string
  "x11"?: boolean
  "stack-paths"?: Array<string>                      // if specified, then the stack path of parent-job must be included in stack-paths or exec will fail
}

export type JobCopyOptions = {
  "ids": Array<string>                               // job ids that should be copied
  "stack-paths"?: Array<string>                      // if specified, then the stack path of the jobs must be included in stack-paths or copy will fail
  "mode": "update"|"overwrite"|"mirror"              // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  "host-path"?: string                               // location where files should be copied. if specified this setting overrides job hostDir
  "manual"?: boolean                                 // manually copy - runs sh shell instead of rsync command
  "all-files"?: boolean                              // if true, then any rsync include or exclude files will be ignored
}

export type JobStopOptions = {
  "ids"?: Array<string>                               // job ids that should be copied
  "stack-paths"?: Array<string>                       // if specified, then the stack path of the jobs must be included in stack-paths or delete will fail
}

export type JobDeleteOptions = JobStopOptions & {
  "states"?: Array<JobState>                        // selector rules mode
}

export type JobStateOptions = {
  "ids": Array<string>                                // job ids that should be copied
  "stack-paths"?: Array<string>                       // only select jobs that pertain to this stack
}

type ID_OSTACK = {
  "id": string                                        // job ids that should be copied
  "stack-paths"?: Array<string>                       // only select jobs that pertain to this stack
}
export type JobAttachOptions = ID_OSTACK
export type JobLogOptions = ID_OSTACK & {
  "lines": string
}

export type JobBuildOptions = {
  'reuse-image': boolean  // will not build if image with proper name already exists
  'verbose'?: boolean
}

export type JobListOptions = {
    filter?: JobInfoFilter
}

export abstract class JobManager // High-Level Job Driver
{

  abstract container_drivers: ContainerDrivers
  abstract output_options: OutputOptions
  abstract configurations: Configurations
  abstract shell: ShellCommand|SshShellCommand

  abstract run(
    job_configuration: JobConfiguration<StackConfiguration<any>>,
    options: JobRunOptions
  ) : ValidatedOutput<NewJobInfo>

  abstract exec(
    job_configuration: JobConfiguration<StackConfiguration<any>>,
    options: JobExecOptions
  ) : ValidatedOutput<NewJobInfo>

  abstract copy( options: JobCopyOptions ) : ValidatedOutput<undefined>

  abstract delete( options: JobDeleteOptions ) : ValidatedOutput<undefined>

  abstract stop( options: JobStopOptions ) : ValidatedOutput<undefined>

  abstract state( options: JobStateOptions ) : ValidatedOutput<JobState[]>

  abstract attach( options: JobAttachOptions ) : ValidatedOutput<undefined>

  abstract log( options: JobLogOptions ) : ValidatedOutput<string>

  abstract list( options: JobListOptions ) : ValidatedOutput<JobInfo[]>

  abstract build (
      stack_configuration: StackConfiguration<any>,
      options: JobBuildOptions
  ) : ValidatedOutput<undefined>

}
