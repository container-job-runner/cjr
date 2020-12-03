import { GenericAbstractService } from "./abstract/GenericAbstractService";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceOptions } from './abstract/AbstractService';
import { JobConfiguration } from '../config/jobs/job-configuration';

export type VNCServiceOptions = {
    'resolution': string
}

export class VNCService extends GenericAbstractService
{
  
    READY_CONFIG = {
        "command": ['vncserver', '-list'],
        "regex-string": ':\\d+'
    }
    
    SERVICE_JOB_PREFIX: string = "VNC"
    job_manager: JobManager
    
    vnc_options:VNCServiceOptions = {
        resolution: '1280x720'
    }

    constructor(job_manager: JobManager, vnc_options?: VNCServiceOptions)
    {
        super();
        this.job_manager = job_manager
        if(vnc_options && /\d+x\d+$/.test(vnc_options.resolution))
            this.vnc_options.resolution = vnc_options.resolution
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] 
    {
        return [`vncserver -rfbport ${options.port.hostPort} -geometry ${this.vnc_options.resolution} ; bash`];
    }

    protected serviceEntrypoint()
    {
        return undefined
    }

}