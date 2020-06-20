import { DriverInit } from './driver-init'
import { Configurations } from './job-manager'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration'
import { DockerJobConfiguration } from '../../config/jobs/docker-job-configuration'
import { ExecConstructorOptions, ExecConfiguration } from '../../config/exec/exec-configuration'

export abstract class DriverInitDockerConfig extends DriverInit
{
    // Generic configuration generator for DockerStackConfiguration
    configurations(options: {'image-tag': string}) : Configurations
    {
        const stack = () => new DockerStackConfiguration({"tag": options['image-tag']})
        const job = (stack_configuration?: StackConfiguration<any>) =>
        {
            if(stack_configuration instanceof DockerStackConfiguration)
                return new DockerJobConfiguration(stack_configuration)
            else
                return new DockerJobConfiguration(new DockerStackConfiguration())
        }
        const exec = (options?:ExecConstructorOptions) => new ExecConfiguration(options)

        return {"stack": stack, "job": job, "exec": exec}
    }
}