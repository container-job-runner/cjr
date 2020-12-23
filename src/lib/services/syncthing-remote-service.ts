import path = require('path');
import { GenericAbstractService } from "./abstract/generic-abstract-service";
import { JobManager } from '../job-managers/abstract/job-manager';
import {  ServiceIdentifier, ServiceOptions } from './abstract/abstract-service';
import { JobConfiguration } from '../config/jobs/job-configuration';

export type SyncthingRemoteServiceOption = {
    'ports': { listen: number, connect: number, gui: number }
}

export class SyncthingRemoteService extends GenericAbstractService
{
    CONSTANTS = {
        "image": "cjrun/syncthing:remote",                          // image that will run Syncthing
        "username": "syncthing",                                    // username inside container
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

    protected newJobConfiguration(identifier: ServiceIdentifier, options: ServiceOptions) : JobConfiguration<any>
    {
        const stack_configuration = this.job_manager.configurations.stack()
        stack_configuration.setImage(this.CONSTANTS.image)
        stack_configuration.addFlag("network", "host")
        // -- generic settings -------------------------------------------------
        stack_configuration.addEnvironmentVariable("USER_NAME", this.CONSTANTS.username)
        stack_configuration.addEnvironmentVariable("USER_ID", "$(id -u)", true, this.job_manager.shell)
        stack_configuration.addEnvironmentVariable("GROUP_ID", "$(id -g)", true, this.job_manager.shell)
        stack_configuration.setContainerRoot(path.posix.join("/home", this.CONSTANTS.username))
        stack_configuration.addFlag('podman-userns', 'keep-id')
        stack_configuration.addFlag('user', 'root')
        // -- syncthing settings -----------------------------------------------
        stack_configuration.addEnvironmentVariable("SYNCTHING_LISTEN_PORT", this.syncthing_options.ports.listen.toString())
        stack_configuration.addEnvironmentVariable("SYNCTHING_CONNECT_PORT", this.syncthing_options.ports.connect.toString())
        stack_configuration.addEnvironmentVariable("SYNCTHING_GUI_PORT", this.syncthing_options.ports.gui.toString())
        // -- add ports (necessary even with network=host or cjr cannot tell if these ports as used) ------------
        stack_configuration.addPort(
            this.syncthing_options.ports.listen,
            this.syncthing_options.ports.listen, 
            "127.0.0.1"
        )
        stack_configuration.addPort(
            this.syncthing_options.ports.connect,
            this.syncthing_options.ports.connect, 
            "127.0.0.1"
        )
        stack_configuration.addPort(
            this.syncthing_options.ports.gui,
            this.syncthing_options.ports.gui, 
            "127.0.0.1"
        )
         
        if(identifier["project-root"])
            stack_configuration.addEnvironmentVariable(
                "SYNCTHING_SYNC_DIRECTORY", 
                path.posix.join("/home/", this.CONSTANTS.username, path.basename(identifier["project-root"]))
            )

        const job_configuration = this.job_manager.configurations.job(stack_configuration)
        job_configuration.remove_on_exit = true
        job_configuration.synchronous = false
        job_configuration.command = this.startCommand(job_configuration, options)
        return job_configuration
    }

    protected startCommand(job_configuration: JobConfiguration<any>, options: ServiceOptions): string[] {
        return []
    }

    protected serviceEntrypoint() {
        return undefined
    }

}