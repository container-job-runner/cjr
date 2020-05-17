import { JobConfiguration } from "../config/jobs/job-configuration";
import { ValidatedOutput } from '../validated-output';
import { RunDriver, NewJobInfo, JobState } from '../drivers-containers/abstract/run-driver';
import { BuildDriver } from '../drivers-containers/abstract/build-driver';
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration';
import { ExecConfiguration, ExecConstructorOptions } from '../config/exec/exec-configuration';

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
  "project-root-file-access": "volume"|"bind"
  "project-root"?: string
  "cwd"?: string
  "x11"?: boolean
}

export type JobExecOptions = {
  "reuse-image": boolean
  "cwd"?: string
  "parent-id": string
  "x11"?: boolean
}

export type JobCopyOptions = {
  "ids": Array<string>                               // job ids that should be copied
  "stack-paths"?: Array<string>                      // only copy jobs that pertain to this stack
  "mode": "update"|"overwrite"|"mirror"              // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  "host-path"?: string                               // location where files should be copied. if specified this setting overrides job hostDir
  "manual"?: boolean                                 // manually copy - runs sh shell instead of rsync command
  "force"?: boolean                                  // always copy
}

export type JobDeleteOptions = {
  "ids": Array<string>                               // job ids that should be copied
  "stack-paths"?: Array<string>                      // only select jobs that pertain to this stack
  "selecter"?: "all"|"all-running"|"all-exited"       // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
}

export type JobStopOptions = JobDeleteOptions

export type JobStateOptions = {
  "ids": Array<string>                               // job ids that should be copied
  "stack-paths"?: Array<string>                      // only select jobs that pertain to this stack
}

export abstract class JobManager // High-Level Job Driver
{

  container_drivers: ContainerDrivers
  output_options: OutputOptions
  configurations: Configurations

  constructor(container_drivers: ContainerDrivers, configurations: Configurations, output_options: OutputOptions)
  {
    this.container_drivers = container_drivers;
    this.configurations = configurations
    this.output_options = output_options
  }

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

}
