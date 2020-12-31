import path = require('path')
import fs = require('fs')
import constants = require('../constants')
import { CLIJobFlags, JobCommand } from './job-command'
import { JobManager } from '../job-managers/abstract/job-manager'
import { nextAvailablePort, nextAvailablePorts, printSyncManagerOutput } from '../functions/cli-functions'
import { RemoteSshJobManager } from '../job-managers/remote/remote-ssh-job-manager'
import { ValidatedOutput } from '../validated-output'
import { ErrorStrings } from '../error-strings'
import { GenericAbstractService } from '../services/abstract/generic-abstract-service'
import { initizeSyncManager, printHorizontalTable, printValidatedOutput, waitUntilSuccess } from '../functions/misc-functions'
import { ShellCommand } from '../shell-command'
import { ServiceIdentifier, ServiceInfo } from '../services/abstract/abstract-service'
import { MultiServiceManager } from '../services/managers/multi-service-manager'
import { JobInfo } from '../drivers-containers/abstract/run-driver'

type CLIServiceStartFlags = CLIJobFlags & {
    "server-port": string,
    "expose": boolean,
    "override-entrypoint": boolean    
}

type ServiceStartConfig = 
{
    "default-access-port" ?: number,
    "wait-config"?: {"timeout"?: number, "max-tries"?: number}
}

type ServiceOnReadyConfig = {
    "access-url" ?: string, 
    "exec" ?: {
        "command" ?: string, 
        "environment" ?: { [key: string] : string }
    }
}

type CLIServiceStopFlags = {
    "resource"?: string,
    "project-root"?: string,
    "here"?: boolean,
    "explicit": boolean,
    "verbose": boolean,
    "quiet": boolean,
    "all" : boolean
}

type CLIServiceListFlags = {
    "resource" ?: string,
    "explicit" : boolean,
    "json" : boolean
}

export abstract class ServiceCommand extends JobCommand
{
    readonly localhost_ip = 'localhost' // use localhost instead of 127.0.0.1 for theia webviews
    protected default_access_port = 8000

    // == Start Flag functions =================================================

    augmentFlagsForServiceStart(flags: CLIServiceStartFlags, args: {"project-root"?: string})
    {
        this.augmentFlagsForJob(flags)
        this.augmentFlagsWithProjectRootArg(args, flags)
        this.overrideResourceFlagForDevCommand(flags)
    }

    augmentFlagsForServiceStop(flags: CLIServiceStopFlags, args: {"project-root"?: string})
    {
        this.augmentFlagsWithProjectSettings(flags, {"project-root": false, "resource": false})
        this.augmentFlagsWithProjectRootArg(args, flags)
        this.augmentFlagsWithHere(flags)
    }

    overrideResourceFlagForDevCommand(flags: {resource?: string}) // used for local development flags
    {
        if(this.settings.get('enable-remote-services') != true)
            flags['resource'] = 'localhost'
    }

    augmentFlagsWithProjectRootArg(args: {"project-root"?: string}, flags: {"project-root"?: string})
    {
        if( args['project-root'] && !flags['project-root'] ) // allow arg to override flag
            flags['project-root'] = path.resolve(args['project-root'])
    }

    // == End Flag functions =================================================

    // == Start Stack functions ==============================================

    createServiceStack(flags: CLIServiceStartFlags)
    {
        const create_stack = this.createStack(flags)
        if( ! create_stack.success )
            return create_stack
        const stack_configuration = create_stack.value.stack_configuration
        stack_configuration.setRsyncUploadSettings({include: undefined, exclude: undefined})
        stack_configuration.setRsyncDownloadSettings({include: undefined, exclude: undefined})
        if(flags['override-entrypoint']) 
            stack_configuration.setEntrypoint(['/bin/bash', '-c'])
        
        return create_stack
    }

    // == End Stack Functions ================================================

    // == Start Service functions ============================================

    async startService<T extends GenericAbstractService>( 
        serviceGenerator: (job_manager: JobManager) => T, 
        flags: CLIServiceStartFlags, 
        options: ServiceStartConfig,
        failure_value: {start: ReturnType<T["start"]>, ready: ReturnType<T["ready"]> }) : Promise<ValidatedOutput<{start: ReturnType<T["start"]>, ready: ReturnType<T["ready"]> }>>
    {
        const failure = new ValidatedOutput(false, failure_value)

        // -- validate project root --------------------------------------------
        const pr_check = this.validProjectRoot(flags['project-root'])
        if( ! pr_check.success )
            return failure.absorb(pr_check)

        // -- create stack for running service ---------------------------------
        const create_stack = this.createServiceStack(flags)
        if( ! create_stack.success )
            return failure.absorb(create_stack)
        const {stack_configuration, job_manager } = create_stack.value
        
        // -- set options ------------------------------------------------------
        const start_sync = this.settings.get('auto-sync-remote-service') && (job_manager instanceof RemoteSshJobManager) && flags["project-root"]
        const start_tunnel = (job_manager instanceof RemoteSshJobManager) && ( ! flags['expose'] )
        
        // -- select ports -----------------------------------------------------
        const container_port_config = this.defaultPort(job_manager, flags["server-port"], flags["expose"], options["default-access-port"] || this.default_access_port)
        const access_port = ( ! start_tunnel ) ? container_port_config.hostPort : nextAvailablePort(this.newJobManager('localhost', {verbose: false, quiet: false, explicit: flags['explicit']}), container_port_config.hostPort)

        // -- start service ----------------------------------------------------
        const service = serviceGenerator(job_manager)
        const identifier = { "project-root": flags["project-root"] }

        const start_result: ReturnType<T["start"]> = service.start(
            identifier,
            {
                "stack_configuration": stack_configuration,
                "project-root": flags["project-root"],
                "reuse-image" : this.extractReuseImage(flags),
                "container-port-config": container_port_config,
                "access-port": access_port,
                "access-ip": this.getAccessIp(job_manager, {"resource": flags["resource"], "expose": flags['expose']}),
                "x11": flags['x11'],
                "labels" : (start_sync) ? { [ constants.label_strings.service.syncing ] : "true" } : undefined // add label if service is syncing
            }
        ) as ReturnType<T["start"]>

        failure.absorb(start_result) // add any warnings from start into failure

        if( ! start_result.success ) 
            return failure
        
        // -- verify service is ready ------------------------------------------
        let ready_result : ReturnType<T["ready"]>       
        if( ! start_result.value.isnew )
        {
            ready_result = service.ready(identifier) as ReturnType<T["ready"]>
        }
        else // wait for new server to start
        {
            ready_result = await waitUntilSuccess(
                () => service.ready(identifier),
                options?.["wait-config"]?.timeout || 3000,
                options?.["wait-config"]?.["max-tries"] || 5
            ) as ReturnType<T["ready"]>
        }

        if( ! ready_result.success ) 
            return failure.absorb(ready_result).pushError(ErrorStrings.SERVICES.UNREADY)

        // exit if port not set (this should never occur -- added for valid TS)
        if(! start_result.value["access-port"] ) 
            return failure         

        // -- start tunnel -----------------------------------------------------
        if( start_tunnel ) {
            const success = this.startTunnel(job_manager, {
                "local-port": access_port,
                "remote-port": container_port_config.hostPort 
            })
            if(! success ) return failure.pushError(ErrorStrings.SERVICES.FAILED_TUNNEL_START)
        }

        // -- start two-way sync ------------------------------------------------
        if( start_sync ) {
            const sync_start = await this.startSyncthing(flags["project-root"] || "", flags["resource"] || "", flags, {"stop-on-fail": true})
            if( ! sync_start.success ) printValidatedOutput(sync_start)
        }
        
        // -- set output values ---------------------------------------------------
        return new ValidatedOutput(true, {start: start_result, ready: ready_result})
    }

    stopService<T extends GenericAbstractService>(
        serviceGenerator: (job_manager: JobManager) => T, 
        flags: CLIServiceStopFlags) : ValidatedOutput<undefined>    
    {
        const job_manager = this.newJobManager(flags["resource"] || 'localhost', {
            verbose: flags['verbose'], 
            quiet: flags['quiet'], 
            explicit: flags['explicit']
        })

        const service = serviceGenerator(job_manager)
        const identifier = (flags['all']) ? undefined : {"project-root": flags['project-root']}
        
        if ( job_manager instanceof RemoteSshJobManager ) // additional stop procedures for RemoteSshJobManager
        {
            const service_list = service.list(identifier).value
            
            // -- release any tunnel ports ---------------------------------------------
            service_list.map( 
                (si: ServiceInfo) => {
                    if((si["access-port"] !== undefined) && (si["server-port"] !== undefined))
                        this.releaseTunnelPort(job_manager, {"local-port": si["access-port"], "remote-port": si["server-port"]})
                } 
            )

            // -- stop two-way sync ----------------------------------------------------
            const sync_identifiers = this.syncShutdownIdentifers(job_manager, service_list)
            sync_identifiers.map( 
                (id: ServiceIdentifier) => {
                    const stop_result = this.stopSyncthing(id["project-root"], flags["resource"] || "", flags)
                    if( ! stop_result.success ) 
                        printValidatedOutput(stop_result)
                }
            )
        }

        return service.stop(identifier)
    
    }

    listService<T extends GenericAbstractService>(
        serviceGenerator: (job_manager: JobManager) => T,
        toDataRowArray: (info: ServiceInfo, service: T) => [ string, string ],
        flags: CLIServiceListFlags) : ValidatedOutput<ServiceInfo[]>    
    {
        const job_manager = this.newJobManager(flags["resource"] || 'localhost', {
            verbose: false, 
            quiet: false, 
            explicit: flags['explicit']
        })

        const service = serviceGenerator(job_manager)
        
        const list_request = service.list()
        if( ! list_request.success )
            return list_request

        if(flags["json"]) { // -- json output ----------------------------------
            console.log(JSON.stringify(list_request.value))
        } 
        else { // -- regular output --------------------------------------------
            printHorizontalTable({
                row_headers:    ["PROJECT", "URL"],
                column_widths:  [9, 100],
                text_widths:    [7, 100],
                silent_clip:    [true, false],
                data:           list_request.value.map( (si:ServiceInfo) => toDataRowArray(si, service) )   
            })
        }

        return list_request
    }

    serviceOnReady( flags: CLIServiceStartFlags, options: ServiceOnReadyConfig )
    {
        if(flags['quiet']) // exit silently
            return
        else if(options?.exec?.command) // exec command
        {
            const exec = new ShellCommand(flags['explicit'], flags['quiet'])
                .execAsync(options.exec.command, {}, [], {
                    detached: true,
                    stdio: 'ignore',
                    env: options.exec?.environment || {}
                })
            if(exec.success) exec.value.unref()
            printValidatedOutput(exec)
        }  
        else if(options["access-url"]) // print service url
            console.log(options["access-url"])
    }

    // == End Service functions ==================================================

    // == Start Service functions ================================================

    async startSyncthing(project_root: string, resource_name: string, output_options: {verbose: boolean, quiet: boolean, explicit: boolean}, options: {"stop-on-fail": boolean}) : Promise<ValidatedOutput<undefined | {local: ValidatedOutput<ServiceInfo|{output:string}>, remote: ValidatedOutput<ServiceInfo|{output:string}>}>>
    {
        // -- validate project root ------------------------------------------------
        const pr_check = this.validProjectRoot(project_root, false)
        if( ! pr_check.success )
            return pr_check
        
        // -- create sync manager --------------------------------------------------
        const sm_request = this.newSyncManager(resource_name, output_options)
        if( ! sm_request.success || sm_request.value === undefined)
            return new ValidatedOutput(false, undefined).absorb(sm_request)
        
        const sync_manager = sm_request.value

        // -- start sync service ---------------------------------------------------
        const identifier = {"project-root": project_root}
        const start_request = sync_manager.start(identifier, 
            {
                "project-root": project_root,
            }
        )

        // -- print output ---------------------------------------------------------
        if ( sync_manager.absorb(start_request).success != false )
            return new ValidatedOutput(false, start_request)

        // -- validate service started properly ------------------------------------
        let ready_output = { "local" : new ValidatedOutput(true, {output: ""}), "remote" : new ValidatedOutput(true, {output: ""}) }
        const ready_request = await waitUntilSuccess(
            () => {
                ready_output = sync_manager.ready(identifier)
                return sync_manager.absorb(ready_output)
            },
            1000,
            5
        )

        if ( ! ready_request.success && options['stop-on-fail'] )
            sync_manager.stop(identifier)

        return new ValidatedOutput(ready_request.success, ready_output)

    }

    stopSyncthing(project_root: string|undefined, resource_name: string, output_options: {verbose: boolean, quiet: boolean, explicit: boolean}) : ValidatedOutput<undefined | {local: ValidatedOutput<undefined>, remote: ValidatedOutput<undefined>}>
    {
        // -- create sync manager --------------------------------------------------
        const sm_request = this.newSyncManager(resource_name, output_options, false)
        if( ! sm_request.success || sm_request.value === undefined)
            return new ValidatedOutput(false, undefined).absorb(sm_request)

        const sync_manager = sm_request.value
                
        // -- stop service ----------------------------------------------------------
        return new ValidatedOutput(true, sync_manager.stop(
            (project_root === undefined) ? undefined : {"project-root": project_root}, // if project_root is undefined, then stop all Syncthing services
            {"local": false, "remote": false}
        ))
    }

    protected newSyncManager(resource_name: string, output_options: {verbose: boolean, quiet: boolean, explicit: boolean}, set_ports: boolean = true) : ValidatedOutput<undefined | MultiServiceManager<{"local": GenericAbstractService, "remote": GenericAbstractService}>>
    {
        // -- validate resource-----------------------------------------------------
        const resource_request = this.getResourceWithKey(resource_name)
        if( ! resource_request.success )
            return new ValidatedOutput(false, undefined).absorb(resource_request)

        const resource = resource_request.value
        
        // -- create sync manager --------------------------------------------------
        const local_manager = this.newJobManager('localhost', {
            "verbose": output_options['verbose'], 
            "quiet": output_options['quiet'], 
            "explicit": output_options['explicit']
        })
        const remote_manager = this.newJobManager(resource_name, {
            "verbose": output_options['verbose'], 
            "quiet": output_options['quiet'], 
            "explicit": output_options['explicit']
        })
        const ports = (set_ports) ? nextAvailablePorts(remote_manager, 20003, 3) : [-1, -1, -1] // create function

        return new ValidatedOutput(true, initizeSyncManager(
            local_manager,
            remote_manager,
            { key: resource.key, username: resource.username, ip: resource.address },
            { listen: ports[0] || -1, connect: ports[1] || -1, gui: ports[2] || -1 }
        ))
    }

    // returns list of identifiers for sync services that should be shutdown if the services described in array services are about to be stopped
    
    protected syncShutdownIdentifers (job_manager : JobManager, services: ServiceInfo[]) : ServiceIdentifier[]
    {
        // 1. ignore services that have an empty project root
        services = services.filter(( si : ServiceInfo ) => si["project-root"])
        if( services.length == 0 ) return [] // no sync services to shutdown

        // 2. extract all non empty project roots
        const service_pr  = services.map( ( si : ServiceInfo ) => si["project-root"] ) as string[]
        const service_ids = services.map( ( si : ServiceInfo ) => si.id )
        
        // 3. get list of running services that are syncing and have matching project roots
        const list_result = job_manager.list( {
            "filter" : { 
                "labels" : {
                    [ constants.label_strings.job["project-root"] ] : service_pr,
                    [ constants.label_strings.service["syncing"] ] : [ "true" ]                  
                }
            }
        } )
        if( ! list_result.success ) return [] // do not shutdown services if list request fails

        // 4. filter out ids of known services, then extract remaining project roots
        const remaining_pr = list_result.value.filter( ( ji:JobInfo ) => ! service_ids.includes(ji.id) )
            .map( ( ji : JobInfo ) => ji.labels[ constants.label_strings.job["project-root"] ] )

        // return setDiff(service_ids, remaining_ids)
        return service_pr.filter((s:string) => ! remaining_pr.includes(s) ).map((s:string) => {return {"project-root": s}})

    }
    
    // == End Service functions ==================================================

    defaultPort(job_manager: JobManager, server_port_flag: string, expose: boolean, starting_port:number=7001)
    {
        const default_address = (expose) ? '0.0.0.0' : '127.0.0.1'
        const port = this.parsePortFlag([server_port_flag]).pop()
        if(port !== undefined && port.address)
            return port
        if(port !== undefined) {
            port.address = default_address
            return port
        }
        const default_port = nextAvailablePort(job_manager, starting_port)
        return {"hostPort": default_port, "containerPort": default_port, "address": default_address}
    }

    // functions for remote servers

    getAccessIp(job_manager: JobManager, flags?: {tunnel?: boolean, resource?: string, expose: boolean})
    {
        if(!flags?.resource)
            return this.localhost_ip
        
        if(job_manager instanceof RemoteSshJobManager) {
            if(flags?.['tunnel'] || flags?.['expose'] != true)
                return this.localhost_ip
            return this.resource_configuration.getResource(flags['resource'])?.address || '0.0.0.0'
        }
        return this.localhost_ip
    }

    startTunnel(job_manager: JobManager, options: {"local-port": number, "remote-port": number}) : boolean
    {
        if(!(job_manager instanceof RemoteSshJobManager))
            return false
        
        return job_manager.shell.tunnelStart({
            "localIP": this.localhost_ip,
            "remotePort": options["remote-port"],
            "localPort": options["local-port"],
            "multiplex": {
                "controlpersist" : 600,
                "reuse-connection": true
            }
        })
    }

    releaseTunnelPort(job_manager: JobManager, options: {"local-port": number, "remote-port": number})
    {
        if(!(job_manager instanceof RemoteSshJobManager))
            return
        
        job_manager.shell.tunnelRelease({
            "localIP": this.localhost_ip,
            "remotePort": options["remote-port"],
            "localPort": options["local-port"]
        })   
    }

    validProjectRoot(project_root?: string, allow_empty: boolean = true) : ValidatedOutput<undefined>
    {
        const success = new ValidatedOutput(true, undefined);
        if(!project_root)
            return (allow_empty) ? success : success.pushError(ErrorStrings.SERVICES.EMPTY_PROJECT_ROOT)
        
        if(fs.existsSync(project_root))
            return success
        
        return success.pushError(ErrorStrings.SERVICES.INVALID_PROJECT_ROOT(project_root || ""))
    }

}
