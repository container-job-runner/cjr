import { ContainerDrivers, Configurations } from './job-manager';

export abstract class DriverInit
{
    abstract drivers( ... args: any) : ContainerDrivers
    abstract configurations( ... args: any) : Configurations
}