import path = require('path')
import { GenericAbstractService } from "./abstract/GenericAbstractService";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceOptions } from './abstract/AbstractService';
import { JobConfiguration } from '../config/jobs/job-configuration';

export class TheiaService extends GenericAbstractService
{
    // there is currently no way to test is theia is running. sleep and accept
    READY_CONFIG = {
        "command": ['sleep 10'],   
        "regex-string": ''
    }
    
    SERVICE_JOB_PREFIX: string = "Theia"
    job_manager: JobManager

    constructor(job_manager: JobManager)
    {
        super();
        this.job_manager = job_manager
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] 
    {
        const port_flag = (options["access-port"]) ? `--port ${options["access-port"].containerPort}` : ''
        const container_root = job_configuration.stack_configuration.getContainerRoot()
        const project_dir = (container_root && options['project-root']) ? path.posix.join(container_root, path.basename(options['project-root'])) : container_root
        return [`theia --hostname 0.0.0.0 ${port_flag} ${project_dir}`];
    }

    protected serviceEntrypoint() {
        return undefined
    }

}