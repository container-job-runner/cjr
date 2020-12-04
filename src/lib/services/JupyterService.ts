import { GenericAbstractService } from "./abstract/GenericAbstractService";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceOptions, ServiceIdentifier } from './abstract/AbstractService';
import { JobConfiguration } from '../config/jobs/job-configuration';
import { ValidatedOutput } from '../validated-output';
import { URL } from 'url';

export type JupyterServiceOption = {
    'interface': 'lab'|'notebook'
}

export class JupyterService extends GenericAbstractService
{
    READY_CONFIG = {
        "command": ['jupyter', 'notebook', 'list'],   
        "regex-string": 'http:\\/\\/\\S+:\\S*'   // matches http://X:X and is equivalent to /http:\/\/\S+:S*/ 
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

    ready(identifier: ServiceIdentifier): ValidatedOutput<{output:string, token: string}>
    {
        const result = super.ready(identifier)
        const url_str = result.value.output.match(
                new RegExp(this.READY_CONFIG["regex-string"])
            )?.pop() || ""
        let token: string = ""
        try { token = new URL(url_str).searchParams.get('token') || "" } catch {}   
        return new ValidatedOutput(
            true, 
            {
                "output": result.value.output, 
                "token": token
            }
        ).absorb(result)
    }

}