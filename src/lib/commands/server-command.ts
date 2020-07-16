import path = require('path')
import { LocalJobCommand } from './local-job-command'
import { ContainerDrivers, JobManager } from '../job-managers/abstract/job-manager'
import { nextAvailablePort } from '../functions/cli-functions'
import { RemoteSshJobManager } from '../job-managers/remote/remote-ssh-job-manager'

export abstract class ServerCommand extends LocalJobCommand
{
    readonly localhost_ip = '127.0.0.1'
    
    defaultPort(drivers: ContainerDrivers, server_port_flag: string, expose: boolean)
    {
        const default_address = (expose) ? '0.0.0.0' : '127.0.0.1'
        const port = this.parsePortFlag([server_port_flag]).pop()
        if(port !== undefined && port.address)
            return port
        if(port !== undefined) {
            port.address = default_address
            return port
        }
        const default_port = nextAvailablePort(drivers, 7001)
        return {"hostPort": default_port, "containerPort": default_port, "address": default_address}
    }

    augmentFlagsWithProjectRootArg(args: {"project-root"?: string}, flags: {"project-root"?: string})
    {
        if( args['project-root'] && !flags['project-root'] ) // allow arg to override flag
            flags['project-root'] = path.resolve(args['project-root'])
    }

    // functions for remote servers

    getAccessIp(job_manager: JobManager, flags?: {tunnel?: boolean, resource?: string})
    {
        if(!flags?.resource)
            return this.localhost_ip
        
        if(job_manager instanceof RemoteSshJobManager) {
            if(flags?.['tunnel'])
                return this.localhost_ip
            return this.resource_configuration.getResource(flags['resource'])?.address || '0.0.0.0'
        }
        return this.localhost_ip
    }

    startTunnel(job_manager: JobManager, options: {port: number})
    {
        if(!(job_manager instanceof RemoteSshJobManager))
            return
        
        job_manager.shell.tunnelStart({
            "localIP": this.localhost_ip,
            "remotePort": options.port,
            "localPort": options.port,
            "multiplex": {
                "controlpersist" : 600,
                "reuse-connection": true
            }
        })
    }

}
