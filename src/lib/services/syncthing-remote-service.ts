import path = require('path');
import constants = require('../constants')
import { GenericAbstractService } from "./abstract/generic-abstract-service";
import { JobManager, JobRunOptions } from '../job-managers/abstract/job-manager';
import { ServiceIdentifier, ServiceInfo, ServiceOptions } from './abstract/abstract-service';
import { JobConfiguration } from '../config/jobs/job-configuration';
import { ValidatedOutput } from '../validated-output';
import { JSTools } from '../js-tools';
import { RemoteSshJobManager, RemoteSshJobRunOptions } from '../job-managers/remote/remote-ssh-job-manager';

export type SyncthingRemoteServiceOption = {
    'ports': { listen: number, connect: number, gui: number }
}

export class SyncthingRemoteService extends GenericAbstractService
{
    CONSTANTS = {
        "image": "cjrun/syncthing:remote",                          // image that will run Syncthing
        "username": "syncthing",                                    // username inside container
        "sync-directory": "sync-directory",                         // directory in home folder that will be synced
        "syncthing-api-key": "md3wGu2ydJgEfeUewxiTrpEUvCmDcdSR"     // API key for accessing Syncthing API inside container
    }    
    
    READY_CONFIG = {
        "command": ['exit'],  // command is set properly in constructor 
        "regex-string": 'pong' 
    }
    
    SERVICE_JOB_PREFIX: string = "Syncthing"
    job_manager: JobManager
    syncthing_options:SyncthingRemoteServiceOption

    constructor(job_manager: JobManager, syncthing_options:SyncthingRemoteServiceOption)
    {
        super();
        this.READY_CONFIG.command = ["curl", "-s", "-H", `X-API-Key: ${this.CONSTANTS["syncthing-api-key"]}`, `http://127.0.0.1:${syncthing_options.ports.gui}/rest/system/ping`]
        this.job_manager = job_manager
        this.syncthing_options = syncthing_options
    }

    setPorts( ports : { listen: number, connect: number, gui: number } )
    {
        this.syncthing_options.ports = ports
    }

    start(identifier: ServiceIdentifier, options: ServiceOptions) : ValidatedOutput<ServiceInfo>
    {
        // -- override syncthing port config ----------------------------------
        const portToPortObject = (port: number) => {return {hostPort: port, containerPort: port, address: "127.0.0.1"}}
        options["container-port-config"] = { 
            ... (options["container-port-config"] || {}), 
            ... {
                "listen":  portToPortObject(this.syncthing_options.ports.listen),
                "connect": portToPortObject(this.syncthing_options.ports.connect),
                "gui":     portToPortObject(this.syncthing_options.ports.gui)
            }            
        }
        return super.start(identifier, options)
    }

    removePersistentData(identifier: ServiceIdentifier)
    {
        if( identifier['project-root'] )
            return this.job_manager.container_drivers.runner.volumeDelete(
                [ this.persistantDataVolume(identifier['project-root']) ]
            )
        return new ValidatedOutput(true, undefined)
    }

    protected newJobConfiguration(identifier: ServiceIdentifier, options: ServiceOptions) : JobConfiguration<any>
    {
        const job_configuration = super.newJobConfiguration(identifier, options)
        const stack_configuration = job_configuration.stack_configuration
        
        stack_configuration.setImage(this.CONSTANTS.image)
        stack_configuration.addFlag("network", "host")
        // -- generic settings -------------------------------------------------
        stack_configuration.addEnvironmentVariable("USER_NAME", this.CONSTANTS.username)
        stack_configuration.addEnvironmentVariable("USER_ID", "$(id -u)", true, this.job_manager.shell)
        stack_configuration.addEnvironmentVariable("GROUP_ID", "$(id -g)", true, this.job_manager.shell)
        stack_configuration.setContainerRoot(path.posix.join("/home", this.CONSTANTS.username, this.CONSTANTS["sync-directory"]))
        stack_configuration.addFlag('podman-userns', 'keep-id')
        stack_configuration.addFlag('user', 'root')
        // -- syncthing settings -----------------------------------------------
        stack_configuration.addEnvironmentVariable("SYNCTHING_LISTEN_PORT", this.syncthing_options.ports.listen.toString())
        stack_configuration.addEnvironmentVariable("SYNCTHING_CONNECT_PORT", this.syncthing_options.ports.connect.toString())
        stack_configuration.addEnvironmentVariable("SYNCTHING_GUI_PORT", this.syncthing_options.ports.gui.toString())
        stack_configuration.addEnvironmentVariable("SYNCTHING_SYNC_DIRECTORY", 
            path.posix.join("/home/", this.CONSTANTS.username, this.CONSTANTS["sync-directory"])
        )
        if(options["project-root"])
            stack_configuration.addVolume(
                this.persistantDataVolume(options["project-root"]),
                path.posix.join("/home", this.CONSTANTS.username, ".config", "syncthing"),
                {"remote-upload" : true}
            )
        
        return job_configuration
    }

    protected newJobRunOptions(options: ServiceOptions) : RemoteSshJobRunOptions|JobRunOptions
    {
        if( this.job_manager instanceof RemoteSshJobManager ) // no need to start rsync on remote if using syncthing
            return { ... super.newJobRunOptions(options) , ... {"skip-file-upload" : true} }
        else
            return super.newJobRunOptions(options)
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] {
        return []
    }

    protected serviceEntrypoint() {
        return undefined
    }

    private persistantDataVolume(project_root: string)
    {
        return `${constants.volumes.syncthing.prefix}-${JSTools.md5(project_root)}`    
    }

}