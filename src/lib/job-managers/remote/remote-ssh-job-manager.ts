import path = require('path')
import chalk = require('chalk');
import { SshShellCommand } from '../../remote/ssh-shell-command';
import { Resource } from '../../remote/config/resource-configuration';
import { Dictionary, label_strings } from '../../constants';
import { ValidatedOutput } from '../../validated-output';
import { JSTools } from '../../js-tools';
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';
import { DriverInitCli } from '../local/driver-init-cli';
import { ContainerDrivers, Configurations, OutputOptions, JobRunOptions, JobExecOptions, JobCopyOptions, JobDeleteOptions, JobBuildOptions } from '../abstract/job-manager';
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration';
import { NewJobInfo, JobInfo } from '../../drivers-containers/abstract/run-driver';
import { JobConfiguration } from '../../config/jobs/job-configuration';
import { GenericJobManager } from '../abstract/generic-job-manager';
import { PathTools } from '../../fileio/path-tools';
import { trim } from '../../functions/misc-functions';

// ========================================================================
// A Job Manager for remote resources that transfers files to host with 
// rsync and executes commands over ssh
// ========================================================================

export type RemoteSshJobManagerUserOptions = {
    "driver"?: "podman"|"docker"
    "selinux"?: boolean                     // if true, then bind mounts will have selinux :Z mode
    "explicit": boolean,
    "output-options"?: OutputOptions
    "image-tag"?: string                    // tag that will be used for all container images    
    "multiplexOptions"?: MultiplexOptions
    "resource": Resource
    "directories": {
        "multiplex": string,                    // directory path for storing ssh multiplex masters
        "copy": string,                         // directory path for storing temporary rsync include-from and exclude-from files during rsync operations to remote host
    }
}

export type MultiplexOptions = {
  "autodisconnect"?:               boolean,
  "autoconnect"?:                  boolean,
  "restart-existing-connection"?:  boolean
}

export class RemoteSshJobManager extends GenericJobManager
{
    private options: Required<RemoteSshJobManagerUserOptions> = {
        "driver": "podman",
        "explicit": false,
        "output-options": {verbose: false, quiet: false},
        "selinux": false,
        "image-tag": "cjr",   
        "multiplexOptions": {
            "autodisconnect": false, 
            "autoconnect": true, 
            "restart-existing-connection": false,
        },
        "resource": {
            "type": "cjr", 
            "address": "", 
            "username": "", 
            "options": {}
        },
        "directories": {
            "multiplex": "",
            "copy": ""
        }  
    }

    protected REMOTELABELS = {
        REMOTE_PROJECT_ROOT: 'remote-project-root',
        CACHED_PROJECT_ROOT: 'cached-project-root'
    }

    protected STATUSHEADERS = {
        BUILD : "Build Output",
        UPLOAD_STACK : "Stack Upload",
        UPLOAD_JOBFILES : "Job File Upload",
        COPY: "Copy",
        START : "Job Output",
        JOB_ID : "Job Id"
    }

    protected WARNINGSTRINGS = {
      JOBCOPY: {
        NO_LOCAL_PROJECTROOT : (id:string) => chalk`{bold Copy Destination Unspecified:} job ${id} has no associated local project root. You must manually specify copy path.`,
        NO_REMOTE_PROJECTROOT : (id:string) => chalk`{bold No Copy Required:} job ${id} has no associated project root.`
      }
    }
    protected ERRORSTRINGS = {
        NO_MATCHING_ID: chalk`{bold No Matching Job ID}`,
        FAILED_START: chalk`{bold Failed to start job}`,
        JOBEXEC: {
            NO_PROJECTROOT : (id:string) => chalk`{bold No Associated Job Files:} job ${id} has no associated project root. Exec is not possible in this job`
        }
    }

    
    shell: SshShellCommand
    container_drivers: ContainerDrivers
    configurations: Configurations
    output_options: OutputOptions

    constructor(options: RemoteSshJobManagerUserOptions)
    {
        super()
        JSTools.rMerge(this.options, options)
        
        // init ssh shell and set resource
        this.shell = new SshShellCommand(
            this.options["explicit"], 
            this.options["output-options"].quiet,
            this.options["directories"]["multiplex"],
            {ssh: {interactive: true}, multiplex: {}}
        )
        this.shell.setResource(options.resource)
        if(this.options.multiplexOptions.autoconnect)
            this.connect()

        // init drivers, configurations, output options
        const initializer = new DriverInitCli()
        this.container_drivers = initializer.drivers(
            this.shell,
            {
                "type": this.options["driver"],
                "selinux": this.options["selinux"]
            }            
        )
        this.configurations = initializer.configurations({
            "image-tag": this.options["image-tag"]
        });
        this.output_options = this.options['output-options']

    }

    // --- connection functions ------------------------------------------------

    connect(options: Dictionary = {interactive: true}) : ValidatedOutput<undefined>
    {
        const success = new ValidatedOutput(true, undefined)

        // -- start ssh multiplex master ---------------------------------------
        if(this.options.multiplexOptions['restart-existing-connection'] && this.shell.multiplexExists(options))
            this.shell.multiplexStop(options)

        if(this.shell.multiplexAlive(options))
            return success
        else
            return new ValidatedOutput(
                this.shell.multiplexStart(options), 
                undefined
            )
    }

    disconnect(options: Dictionary = {}) : ValidatedOutput<undefined>
    {
        // -- stop ssh multiplex master ---------------------------------------
        return new ValidatedOutput(this.shell.multiplexStop(options), undefined)        
    }

    protected activateX11() 
    {
        this.shell.base_options['ssh']['x11'] = true;
        this.shell.base_options['multiplex']['x11'] = true;
        this.shell.base_options['multiplex']['tag'] = 'x11-';
        this.connect()
    }

    protected deactivateX11() 
    {
        this.shell.base_options['ssh']['x11'] = false;
        this.shell.base_options['multiplex']['x11'] = false;
        this.shell.base_options['multiplex']['tag'] = '';
        this.connect()
    }

    // uploadJobFiles uploads files from the project-root to the remote resource

    private uploadJobFiles(local_project_root: string|undefined, rules: {include: string, exclude: string}, cached: boolean) : ValidatedOutput<string>
    {
        const result = new ValidatedOutput(true, "")
        if(!local_project_root)
            return result
        
        let remote_project_root = this.cachedPathConverter(local_project_root, "jobs")
        if(!cached) { // -- if cached = false, then create new remote directory
            const mktemp_request = trim(
                this.shell.output(
                    'mktemp', {
                        tmpdir: path.posix.join(this.remoteWorkDirectory(), "jobs"),
                        directory: {}
                    }
                )
            )
            if(!mktemp_request.success) 
                return result.absorb(mktemp_request)
            remote_project_root = mktemp_request.value
        }

        const rsync_flags: Dictionary = {a: {}, delete: {}}
        if(rules.include) 
            rsync_flags['include-from'] = rules.include
        if(rules.exclude) 
            rsync_flags['exclude-from'] = rules.exclude
        if(this.output_options.verbose) 
            rsync_flags['v'] = {}

        return (new ValidatedOutput(true, remote_project_root)).absorb(
            this.shell.rsync(
                PathTools.addTrailingSeparator(local_project_root), // upload contents (not dir)
                remote_project_root,
                'push',
                rsync_flags
            )
        )        
    }

    // uploadStackFiles uploads all files required to run a job with a stack

    private uploadStackFiles(local_stack_configuration: StackConfiguration<any>) : ValidatedOutput<undefined>
    { 
        const result = new ValidatedOutput(true, undefined)
        
        // -- upload stack ----------------------------------------------------
        const local_stack_path = local_stack_configuration.stack_path
        if(local_stack_path) 
        {
            const rsync_flags:Dictionary = {a:{}, delete: {}}
            if(local_stack_configuration instanceof DockerStackConfiguration) { // only push build directory
                rsync_flags['include'] = 'build/***'
                rsync_flags['exclude'] = '*'
            }
            if(this.output_options.verbose) 
                rsync_flags['v'] = {}

            result.absorb(
                this.shell.rsync(
                    PathTools.addTrailingSeparator(local_stack_path, 'posix'), // upload contents (not dir)
                    this.cachedPathConverter(local_stack_path, 'stacks'),
                    'push',
                    rsync_flags
                )
            )
        }
         
        // -- upload remote binds ----------------------------------------------
        const rsync_flags_binds:Dictionary = {a: {}, delete: {}}
        if(this.output_options.verbose) 
            rsync_flags_binds['v'] = {}
        
        local_stack_configuration.getBindMountPaths(true).map( (bind_path:string) => {
            result.absorb(
                this.shell.rsync(
                    PathTools.addTrailingSeparator(bind_path, 'posix'), // upload contents (not dir)
                    this.cachedPathConverter(bind_path, 'binds'),
                    'push',
                    rsync_flags_binds
                )
            )
        })

        return result
    }

    // create remote working directories on remote directories

    private createWorkingDirectories() : ValidatedOutput<undefined> {
        const dirs = ['stacks', 'binds', 'jobs'].map( 
            (s:string) => `${path.posix.join(this.remoteWorkDirectory(), s)}`
        )
        return (new ValidatedOutput(true, undefined)).absorb(
            this.shell.exec('mkdir', {p : {}}, dirs)
        )
    }
    
    // pathConverter specifies the location where local files will be uploaded to remote resource

    private cachedPathConverter(local_path: string, data_type:'stacks'|'binds'|'jobs') {
        return path.posix.join(this.remoteWorkDirectory(), data_type, JSTools.md5(local_path))
    }

    private remoteWorkDirectory() : string {
        return this.options.resource.options?.['remote-path'] || `/home/${this.options.resource.username}/.cjr-remote`
    }

    // generateRemoteConfiguration converts a local_stack_configuration so that it can be run on a remote resource

    private generateRemoteStackConfiguration(local_stack_configuration: StackConfiguration<any>) : StackConfiguration<any>
    {
        // make a separate function: generateRemoteConfiguration()
        const remote_stack_configuration = local_stack_configuration.copy();
        remote_stack_configuration.removeAllVolumes()
        remote_stack_configuration.removeLocalBinds()
        remote_stack_configuration.mapPaths({ // rewrite this function so that it accepts functions, not mappings
            'stack-path': (s:string) => this.cachedPathConverter(s, 'stacks'),
            'bind-paths': (s:string) => this.cachedPathConverter(s, 'binds')
        })
        return remote_stack_configuration   
    }

    private generateRemoteJobConfiguration(local_job_configuration: JobConfiguration<any>) : JobConfiguration<StackConfiguration<any>>
    {
        const remote_job_configuration = local_job_configuration.copy()
        remote_job_configuration.stack_configuration = this.generateRemoteStackConfiguration(
            local_job_configuration.stack_configuration
        )
        return remote_job_configuration
    }

    private bindProjectRoot(remote_configuration: StackConfiguration<any>, local_project_root: string|undefined, remote_project_root: string|undefined)
    {
        if(!local_project_root || !remote_project_root) return
        const lpr_basename = path.basename(local_project_root)
        remote_configuration.addBind(
            remote_project_root, 
            path.posix.join(remote_configuration.getContainerRoot(), lpr_basename),
            {'allow-nonexistant': true} // avoid directory exists check (since directory is remote)
        )
    }

    // == START JOB FUNCTIONS ==================================================

    // generates a JobConfiguration object for remote job, uploads stack to remote resource and builds it 
    
    protected uploadLocalStackAndBuild(local_job_configuration: JobConfiguration<StackConfiguration<any>>, build_options: JobBuildOptions) : ValidatedOutput<JobConfiguration<StackConfiguration<any>>>
    {
        const remote_job_configuration = this.generateRemoteJobConfiguration(local_job_configuration)
        const result = new ValidatedOutput(true, remote_job_configuration)

        // -- create remote working directories --------------------------------
        const cwdir = this.createWorkingDirectories()
        if(!cwdir.success) return result.absorb(cwdir)

        // -- upload stack data ------------------------------------------------
        this.printStatus({header: this.STATUSHEADERS.UPLOAD_STACK})
        const stack_upload = this.uploadStackFiles(local_job_configuration.stack_configuration)
        if(!stack_upload.success) return result.absorb(stack_upload)

        // -- build stack ------------------------------------------------------
        this.printStatus({"header": this.STATUSHEADERS.BUILD})
        const build = this.build(
            remote_job_configuration.stack_configuration, 
            build_options
        )
        if(!build.success) return result.absorb(build)
        return result
    }


    run( job_configuration: JobConfiguration<StackConfiguration<any>>, options: JobRunOptions ) : ValidatedOutput<NewJobInfo> 
    {
        const failure = new ValidatedOutput(false, {id: "", output: "", "exit-code": -1});
        
        // -- upload stack, build, and generate remote job configuration -------
        const upload_stack = this.uploadLocalStackAndBuild(
            job_configuration, 
            {"reuse-image": options['reuse-image']}
        )
        if(!upload_stack.success)
            return failure.absorb(upload_stack)
        const remote_job_configuration = upload_stack.value

        // -- upload job data --------------------------------------------------
        this.printStatus({header: this.STATUSHEADERS.UPLOAD_JOBFILES})
        const cached = options['project-root-file-access'] === 'bind'
        const upload = this.uploadJobFiles(
            options['project-root'],
            job_configuration.stack_configuration.getRsyncUploadSettings(true),
            cached
        )
        if(!upload.success) return failure.absorb(upload);
        const remote_project_root = upload.value;

        this.bindProjectRoot(
            remote_job_configuration.stack_configuration, 
            options['project-root'], 
            remote_project_root
        )
        remote_job_configuration.addLabel(this.REMOTELABELS.REMOTE_PROJECT_ROOT, remote_project_root)
        remote_job_configuration.addLabel(this.REMOTELABELS.CACHED_PROJECT_ROOT, (cached) ? 'TRUE' : 'FALSE')

        // -- start new x11 multiplexor ----------------------------------------
        if(options['x11']) 
            this.activateX11()

        // -- run job ----------------------------------------------------------
        const result = super.run(remote_job_configuration, options)

        if(options['x11'])
            this.deactivateX11()

        return result
    }

    exec(local_job_configuration: JobConfiguration<StackConfiguration<any>>, exec_options: JobExecOptions) : ValidatedOutput<NewJobInfo>
    {
        const failure = new ValidatedOutput(false, {id: "", output: "", "exit-code": -1});
        
        // -- upload stack, build, and generate remote job configuration -------
        const upload_stack = this.uploadLocalStackAndBuild(
            local_job_configuration, 
            {"reuse-image": exec_options['reuse-image']}
        )
        if(!upload_stack.success)
            return failure.absorb(upload_stack)
        const remote_job_configuration = upload_stack.value
        
        // -- start new x11 multiplexor ----------------------------------------
        if(exec_options['x11']) 
            this.activateX11()
        
        const result = super.exec(remote_job_configuration, exec_options)

        if(exec_options['x11'])
            this.deactivateX11()

        return result
    }

    protected configureExecFileMounts(job_configuration: JobConfiguration<StackConfiguration<any>>, exec_options: JobExecOptions, parent_job: JobInfo) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(true, undefined)
        const parent_local_project_root = parent_job.labels?.[label_strings.job["project-root"]] || ""
        const parent_remote_project_root = parent_job.labels?.[this.REMOTELABELS['REMOTE_PROJECT_ROOT']] || ""
        
        if(!parent_local_project_root || !parent_remote_project_root)
            return result.pushError(this.ERRORSTRINGS.JOBEXEC.NO_PROJECTROOT(parent_job.id))

        this.bindProjectRoot(job_configuration.stack_configuration, parent_local_project_root, parent_remote_project_root)
        return result
    }

    protected copyJob(job:JobInfo, options: JobCopyOptions ) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(false, undefined)
        
        // -- 1. extract label information -------------------------------------
        const id = job.id;
        const local_project_root  = job.labels?.[label_strings.job["project-root"]] || ""
        const remote_project_root = job.labels?.[this.REMOTELABELS['REMOTE_PROJECT_ROOT']] || ""
        const labels_ie = {
            include: job.labels?.[label_strings.job["download-include"]] || "", 
            exclude: job.labels?.[label_strings.job["download-exclude"]] || ""  
        }
        if(!local_project_root) 
            return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_LOCAL_PROJECTROOT(id))
        if(!remote_project_root) 
            return result.pushWarning(this.WARNINGSTRINGS.JOBCOPY.NO_REMOTE_PROJECTROOT(id))
        
        // -- 2. copy files ----------------------------------------------------
        return result.absorb(
            this.shell.rsync(
                local_project_root,
                PathTools.addTrailingSeparator(remote_project_root, 'posix'),
                'pull',
                this.rsyncCopyFlags(labels_ie, options)
            )
        )
    }

    private rsyncCopyFlags(labels: {include: string, exclude: string}, options: JobCopyOptions) : Dictionary
    {
        const flags:Dictionary = {a: {}}
        switch(options.mode)
        {
            case "update":
                flags['update'] = {}
                break
            case "mirror":
                flags['delete'] = {}
                break
            case "overwrite":
            default:
                break
        }
        if(this.output_options.verbose) flags.v = {}
        if(labels.include) flags['include'] = this.includeExcludeLabelToFlag(labels.include)
        if(labels.exclude) flags['exclude'] = this.includeExcludeLabelToFlag(labels.exclude)

        return flags
    }

    protected deleteJob(job:JobInfo, options: JobDeleteOptions)
    {
        const result = super.deleteJob(job, options)
        
        // -- remove any tmp directories ---------------------------------------    
        const uncached = (job.labels?.[this.REMOTELABELS['CACHED_PROJECT_ROOT']] === 'TRUE')
        const remote_project_root = job.labels?.[this.REMOTELABELS['REMOTE_PROJECT_ROOT']]
        
        if(uncached) // only delete uncached files
            return result
        if(!PathTools.ischild(PathTools.split(this.remoteWorkDirectory()), PathTools.split(remote_project_root))) // verify we only delete files inside work directory
            return result
        
        const file_delete = this.shell.exec('rm', {r: {}, f: {}}, [remote_project_root])
        result.absorb(file_delete)
        if(file_delete.success)
            console.log(` deleted files ${remote_project_root}.`)

        return result
    }

    // == END JOB FUNCTIONS ====================================================

}