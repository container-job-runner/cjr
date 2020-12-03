import path = require('path')
import { GenericAbstractService } from "./abstract/GenericAbstractService";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceOptions } from './abstract/AbstractService';
import { JobConfiguration } from '../config/jobs/job-configuration';

export type JupyterServiceOption = {
    'interface': 'lab'|'notebook'
}

export class JupyterService extends GenericAbstractService
{
    READY_CONFIG = {
        "command": ['jupyter', 'notebook', 'list'],   
        "regex-string": 'http:\\/\\/\\S+:\S*'   // matches http://X:X and is equivalent to /http:\/\/\S+:S*/ 
    }
    
    SERVICE_JOB_PREFIX: string = "Jupyter"
    job_manager: JobManager
    jupyter_options:JupyterServiceOption

    constructor(job_manager: JobManager, jupyter_options:JupyterServiceOption)
    {
        super();
        this.job_manager = job_manager
        this.jupyter_options = jupyter_options
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] 
    {
        return [`jupyter ${this.jupyter_options['interface'] == 'lab' ? 'lab' : 'notebook'} --ip=0.0.0.0 --port=${options.port.containerPort}`]
    }

    protected serviceEntrypoint() {
        return undefined
    }

}