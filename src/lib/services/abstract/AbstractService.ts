import { ValidatedOutput } from '../../validated-output';
import { JobManager } from '../../job-managers/abstract/job-manager'
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';

export type ServiceIdentifier = {
  "project-root"?: string
}

export type ServiceOptions = {
  "stack_configuration": StackConfiguration<any> // stack configuration to run service
  "port": {hostPort: number, containerPort: number, address?: string} // exposed port for service
  "ip": string,
  "project-root"?: string // host project root
  "reuse-image"?: boolean // specifies if image should be reused if already build
  "x11"?: boolean // determines if x11 should be launched in image
}

export type ServiceInfo = {
  "id": string,
  "port": number,
  "ip": string,
  "project-root"?: string
  "isnew": boolean
}

export abstract class AbstractService
{
    abstract job_manager: JobManager

    abstract start(identifier: ServiceIdentifier,  options: ServiceOptions) : ValidatedOutput<ServiceInfo> // start new service
    abstract stop(identifier?: ServiceIdentifier) : ValidatedOutput<undefined> // stop running services, or all services if identifier is empty
    abstract list(identifier?: ServiceIdentifier) : ValidatedOutput<ServiceInfo[]> // list information of runnign service, or all running services if identifier is empty
    abstract ready(identifier: ServiceIdentifier) : ValidatedOutput<any> // determine if service is ready to be accessed
}