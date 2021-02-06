import { GenericAbstractService } from "./abstract/generic-abstract-service";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceOptions, ServiceIdentifier } from './abstract/abstract-service';
import { JobConfiguration } from '../config/jobs/job-configuration';
import { ValidatedOutput } from '../validated-output';
import { URL } from 'url';

export type JupyterServiceOption = {
    'interface': 'lab'|'notebook'
}

export class JupyterService extends GenericAbstractService
{
    READY_CONFIG = {
        "command": ['exit'],  // command is set dynamically in constructor 
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

        if(jupyter_options.interface == "lab") // supports both Jupyter 2.0 and 3.0
            this.READY_CONFIG.command = ['sh', '-c', 'if jupyter lab --version | grep -qe "^2." ; then jupyter notebook list ; else jupyter lab list ; fi'] 
        else
            this.READY_CONFIG.command = ['jupyter', 'notebook', 'list']
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] 
    {
        const port_flag = (options?.["container-port-config"]?.["server"]) ? `--port=${options["container-port-config"]["server"].containerPort}` : ''
        return [`jupyter ${this.jupyter_options['interface'] == 'lab' ? 'lab' : 'notebook'} ${port_flag} --ip=0.0.0.0`]
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