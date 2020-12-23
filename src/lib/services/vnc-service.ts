import { GenericAbstractService } from "./abstract/generic-abstract-service";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceOptions } from './abstract/abstract-service';
import { JobConfiguration } from '../config/jobs/job-configuration';
import { ShellCommand } from '../shell-command';

export type VNCServiceOptions = {
    "resolution": string
    "password": string
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
        resolution: "1280x720",
        password: "password"
    }

    constructor(job_manager: JobManager, vnc_options?: VNCServiceOptions)
    {
        super();
        this.job_manager = job_manager
        if(vnc_options && /\d+x\d+$/.test(vnc_options.resolution))
            this.vnc_options.resolution = vnc_options.resolution
        if(vnc_options && vnc_options.password)
            this.vnc_options.password = vnc_options.password
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] 
    {
        const port_flag = (options["access-port"]) ? `-rfbport ${options["access-port"].containerPort}` : ''
        const commands = [
            `chmod 600 ~/.vnc/passwd`,            
            `vncserver ${port_flag} -geometry ${this.vnc_options.resolution} && tail -f /dev/null`]
        if(this.vnc_options.password)
            commands.unshift(`echo ${ShellCommand.bashEscape(this.vnc_options.password)} | vncpasswd -f > ~/.vnc/passwd`)
        return [ commands.join(" ; ") ];
    }

    protected serviceEntrypoint()
    {
        return undefined
    }

}