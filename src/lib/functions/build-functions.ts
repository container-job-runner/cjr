import { ValidatedOutput } from '../validated-output'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobConfiguration } from '../config/jobs/job-configuration'
import { NewJobInfo } from '../drivers-containers/abstract/run-driver'
import { ContainerDrivers } from '../job-managers/job-manager'

export type BuildOptions = {
  'reuse-image': boolean     // will not build if image with proper name already exists
  'verbose'?: boolean
}

export function buildImage(configuration: StackConfiguration<any>, drivers: ContainerDrivers, build_options: BuildOptions) : ValidatedOutput<undefined>
{
  const result = new ValidatedOutput(true, undefined)
  if(build_options["reuse-image"] && drivers.builder.isBuilt(configuration))
    return result
  else
    return result.absorb(
      drivers.builder.build(configuration, (build_options.verbose) ? "inherit" : "pipe", build_options)
    )
}

export function buildAndRun(job_configuration: JobConfiguration<StackConfiguration<any>>, drivers: ContainerDrivers, build_options:BuildOptions) : ValidatedOutput<NewJobInfo>
{
  const failed_result = new ValidatedOutput(false, {"id": "", "exit-code": 0, "output": ""});
  const build_result = buildImage(job_configuration.stack_configuration, drivers, build_options)
  if(!build_result.success)
    return failed_result
  return drivers.runner.jobStart(job_configuration, "inherit")
}

