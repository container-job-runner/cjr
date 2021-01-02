import { ValidatedOutput } from '../../validated-output';
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';

export type ServiceIdentifier = {
  "project-root"?: string
}

export type ServiceOptions = {
  "stack_configuration"?: StackConfiguration<any> // stack configuration to run service
  "container-port-config"?: { [key: string] : {hostPort: number, containerPort: number, address?: string}} // container port mapping for the service
  "access-port"?: number, // port from which user should access service
  "access-ip"?: string, // access ip for service
  "project-root"?: string // host project root
  "reuse-image"?: boolean // specifies if image should be reused if already build
  "x11"?: boolean // determines if x11 should be launched in image,
  "labels"?: { [key : string] : string } // additional labels for service container
}

export type ServiceInfo = {
  "id": string,
  "service-ports": { [ key : string ] : number }   // ports that are exposed on the machine that is running the service
  "access-port"?: number,   // port from which user accesses service (may be different from server-port if ssh-tunnel exists)
  "access-ip"?: string,     // ip from which user accesses service
  "project-root"?: string
  "isnew": boolean
}

export abstract class AbstractService
{
    abstract start(identifier: ServiceIdentifier,  options: ServiceOptions) : ValidatedOutput<ServiceInfo> // start new service
    abstract stop(identifier?: ServiceIdentifier) : ValidatedOutput<undefined> // stop running services, or all services if identifier is empty
    abstract list(identifier?: ServiceIdentifier) : ValidatedOutput<ServiceInfo[]> // list information of runnign service, or all running services if identifier is empty
    abstract ready(identifier: ServiceIdentifier) : ValidatedOutput<any> // determine if service is ready to be accessed
}