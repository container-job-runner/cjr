import constants = require('../../constants')
import { AbstractService, ServiceIdentifier, ServiceOptions, ServiceInfo } from "./abstract-service";
import { ValidatedOutput } from "../../validated-output";
import { JobManager, JobRunOptions } from "../../job-managers/abstract/job-manager";
import { JobConfiguration } from '../../config/jobs/job-configuration';
import { JobInfo, jobIds, firstJobAsArray, jobFilter } from '../../drivers-containers/abstract/run-driver';
import { JSTools } from '../../js-tools';
import { LocalJobManager } from '../../job-managers/local/local-job-manager';
import chalk = require('chalk');
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';

export abstract class GenericAbstractService extends AbstractService
{
    abstract job_manager: JobManager

    protected abstract SERVICE_JOB_PREFIX:string
    protected abstract READY_CONFIG: {"command": string[], "regex-string": string}
    protected abstract startCommand(job_configuration: JobConfiguration<any>, options:ServiceOptions) : string[]
    protected abstract serviceEntrypoint() : undefined|string[]

    protected SERVICE_LABELS = {
        "service-ports": "service-ports",
        "access-port": "service-access-port",
        "access-ip": "service-access-ip"
    }

    protected ERRORS = {
        NOT_RUNNING: (identifier?:ServiceIdentifier) => {
            if(identifier?.['project-root'])
                return chalk`${this.SERVICE_JOB_PREFIX} is not running in project directory "{green ${identifier['project-root']}}".`;
            else
                return chalk`${this.SERVICE_JOB_PREFIX} is not running.`;
        },
    }

    protected identifierToJobName(identifier: ServiceIdentifier) : string 
    {
        if(identifier['project-root']) 
            return `${this.SERVICE_JOB_PREFIX}-${JSTools.md5(identifier['project-root'])}`
        return `${this.SERVICE_JOB_PREFIX}[NONE]`;    
    }

    start(identifier: ServiceIdentifier, options: ServiceOptions) : ValidatedOutput<ServiceInfo>
    {
        // -- if service is already running return current ---------------------
        const info_request = this.getJobInfo(identifier)
        const job_info = info_request.value.pop();
        if(info_request.success && job_info !== undefined) 
            return new ValidatedOutput(
                true, 
                this.jobInfoToServiceInfo(job_info)
            )
                
        // -- start new service ------------------------------------------------
        const job = this.job_manager.run(
            this.addGenericServiceLabels(
                this.newJobConfiguration(identifier, options),
                identifier, 
                options
            ), 
            this.newJobRunOptions(options)
        )
        return new ValidatedOutput(true, {
                "id": job.value.id,
                "service-ports": this.extractPorts(options["container-port-config"] || {}),
                "access-port": options["access-port"],
                "access-ip": options["access-ip"],
                "project-root": identifier["project-root"],
                "isnew": true
            }).absorb(job)
    }

    protected newJobConfiguration(identifier: ServiceIdentifier, options: ServiceOptions) : JobConfiguration<StackConfiguration<any>>
    {
        const stack_configuration = ( options.stack_configuration !== undefined ) ? options["stack_configuration"] : this.job_manager.configurations.stack()
        if(options['container-port-config'])
            Object.keys(options['container-port-config']).map( (key:string) => {
                const port_config = options['container-port-config']?.[key]
                if(port_config === undefined) return                
                stack_configuration.addPort(port_config.hostPort, port_config.containerPort, port_config.address)
            })
        
        const entrypoint = this.serviceEntrypoint()
        if(entrypoint)
            stack_configuration.setEntrypoint(entrypoint)

        const job_configuration = this.job_manager.configurations.job(stack_configuration)
        job_configuration.remove_on_exit = true
        job_configuration.synchronous = false
        job_configuration.command = this.startCommand(job_configuration, options)
        return job_configuration
    }
    
    protected newJobRunOptions(options: ServiceOptions) : JobRunOptions
    {
        return {
            "project-root": options["project-root"],
            "cwd": options["project-root"],
            "reuse-image": (options?.["reuse-image"] !== undefined) ? options["reuse-image"] : true,
            "x11": options.x11,
            "project-root-file-access": "shared"
        }
    }

    protected addGenericServiceLabels(job_configuration: JobConfiguration<any>, identifier: ServiceIdentifier, options: ServiceOptions)
    {
        if(options.labels !== undefined)
            Object.keys(options.labels).map(
                ( field : string ) => {
                    if( options.labels?.[field])
                        job_configuration.addLabel(field, options.labels[field])
                }
            )
        
        job_configuration.addLabel(constants.label_strings.job.name, this.identifierToJobName(identifier))
        if(options["access-port"])
            job_configuration.addLabel(this.SERVICE_LABELS["access-port"], `${options["access-port"]}`);
        if(options["access-ip"])
            job_configuration.addLabel(this.SERVICE_LABELS["access-ip"], `${options["access-ip"]}`);
        job_configuration.addLabel(this.SERVICE_LABELS["service-ports"], JSON.stringify(this.extractPorts(options["container-port-config"] || {})));
        return job_configuration
    }

    protected extractPorts = ( cpc : { [key: string] : { hostPort: number } }  ) => Object.keys(cpc).reduce( 
        ( accum : { [ key: string] : number } , key : string) => {
            accum[key] = cpc[key].hostPort
            return accum
        }, {})
    
    stop(identifier?: ServiceIdentifier, copy:boolean=(!(this.job_manager instanceof LocalJobManager))) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(true, undefined)
        const job_ids:string[] = []

        const job_info_request = this.getJobInfo(identifier)
        job_ids.push( ... jobIds( job_info_request ).value )
        result.absorb(job_info_request)

        if(job_ids.length == 0 || !result.success)
            return result.pushError(this.ERRORS.NOT_RUNNING(identifier))
        
        if(copy && job_ids.length > 0)
            result.absorb(
                this.job_manager.copy(
                    { "ids": job_ids, "mode": "update", "warnings" : { "no-project-root" : false } }
                )
            )

        return result.absorb(
            this.job_manager.stop(
                { "ids": job_ids }
            )
        )
    }

    list(identifier?: ServiceIdentifier) : ValidatedOutput<ServiceInfo[]>
    {
        const job_info_request = this.getJobInfo(identifier);
        return new ValidatedOutput(
            true,
            job_info_request.value.map((ji:JobInfo) => this.jobInfoToServiceInfo(ji))
        ).absorb(job_info_request)
    }
    
    protected jobInfoToServiceInfo(job_info: JobInfo) : ServiceInfo
    {
        const parseServicePortLabel = (s: string | undefined) => {
            if( s === undefined ) return {}
            try { return JSON.parse(s) }
            catch { return {} }
        }
        
        return {
            "id": job_info.id,
            "service-ports": parseServicePortLabel(job_info.labels[this.SERVICE_LABELS['service-ports']]),
            "access-port": parseInt(job_info.labels[this.SERVICE_LABELS['access-port']]) || undefined,
            "access-ip": job_info.labels[this.SERVICE_LABELS["access-ip"]],
            "project-root": job_info.labels[constants.label_strings.job["project-root"]],
            "isnew": false
        }
    }

    protected getJobInfo(identifier?: ServiceIdentifier) : ValidatedOutput<JobInfo[]>
    {
        const label_match = (identifier == undefined) ? this.SERVICE_JOB_PREFIX : this.identifierToJobName(identifier)
        const job_info_request = this.job_manager.container_drivers.runner.jobInfo({
                'labels': { [ constants.label_strings.job.name ] : [ label_match ] },
                'states': ['running']
            })
        
        return (identifier == undefined) ? job_info_request : firstJobAsArray(job_info_request)
    }

    ready(identifier: ServiceIdentifier): ValidatedOutput<{output:string}>
    {
        const failure = new ValidatedOutput(false, {output: ""});
        
        // -- get job id -------------------------------------------------------
        const job_info_request = this.getJobInfo(identifier)
        const job_info = job_info_request.value.pop()
        if( ! job_info_request.success || job_info === undefined ) return failure
        
        // -- exec command ----------------------------------------------------- 
        const exec_configuration = this.job_manager.configurations.exec()
        exec_configuration.command = this.READY_CONFIG.command
        const exec_request = this.job_manager.container_drivers.runner.jobExec(job_info.id, exec_configuration, "pipe")
        if( ! exec_request.success ) return failure

        // -- validate output --------------------------------------------------
        const output = exec_request.value.output
        if(new RegExp(this.READY_CONFIG["regex-string"]).test(output))
            return new ValidatedOutput(true, {"output": output});

        return failure
    }

}