import path = require('path')
import { ValidatedOutput } from '../validated-output';
import { SyncManager } from './sync-manager';
import { LocalJobManager } from '../job-managers/local/local-job-manager';
import { Configurations } from '../job-managers/abstract/job-manager';
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration';
import { rsync_constants, Dictionary } from '../constants';
import { FileTools } from '../fileio/file-tools';
import { ShellCommand } from '../shell-command';

// -- used by functions jobCopy and syncHostDirAndVolume
type RsyncIncludeExclude = {
    include?: string,
    exclude?: string
}

type RsyncRules = {
    include?: string[],
    exclude?: string[]
}

export type VolumeRsyncOptions = {
  "host-path": string                                                           // path on host where files should be copied to
  "volume": string                                                              // id of volume that contains files
  "mode": "update" | "overwrite" | "mirror"                                         // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  "verbose"?: boolean                                                           // if true rsync will by run with -v flag
  "files"?: RsyncIncludeExclude                                                 // rsync include-from and rsync exclude-from
  "rules"?: RsyncRules
  "chown"?: string                                                              // string that specifies the username or id to use with command chown
  "manual"?: boolean                                                            // if true starts interactive shell instead of rsync job
}

export class VolumeSyncManager extends SyncManager
{
    copyToHost( job_manager: LocalJobManager, options: VolumeRsyncOptions ) : ValidatedOutput<undefined>
    {
        return this.copy(job_manager, "to-host", options)
    }

    copyFromHost( job_manager: LocalJobManager, options: VolumeRsyncOptions ) : ValidatedOutput<undefined>
    {
        return this.copy(job_manager, "to-volume", options)
    }

    private copy( job_manager: LocalJobManager, direction: "to-host"|"to-volume", options: VolumeRsyncOptions ) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(true, undefined)
        if(!options["host-path"]) return result
        if(!options["volume"]) return result

        // remove invalid include and exclude files
        this.filterRsyncIncludeExclude(options.files)

        // -- create stack configuration for rsync job -------------------------
        const rsync_stack_configuration = this.rsyncStackConfiguration(
            job_manager.configurations, 
            direction, 
            options
        )
        // -- ensure rsync container is built ----------------------------------
        const build_result = job_manager.build(
            rsync_stack_configuration, 
            {"reuse-image": true}
        )
        if(!build_result.success) 
            return build_result
        // -- set rsync flags --------------------------------------------------
        const rsync_flags:Dictionary = {a: {}}
        this.addRsyncIncludeExcludeFlags(rsync_flags, options?.rules, options?.files)
        switch(options.mode)
        {
            case "update":
                rsync_flags['update'] = {}
                break
            case "mirror":
                rsync_flags['delete'] = {}
                break
            case "overwrite":
            default:
                break
        }
        if(options?.verbose) rsync_flags.v = {}
        // -- set rsync job ----------------------------------------------------
        const rsync_job_configuration = job_manager.configurations.job(rsync_stack_configuration)
        rsync_job_configuration.remove_on_exit = true
        rsync_job_configuration.synchronous = true
        
        const rsync_base_command = this.rsyncCommandString(
            rsync_constants.source_dir,
            rsync_constants.dest_dir,
            rsync_flags
        )

        if(options['manual']) {
            rsync_job_configuration.command = ['sh']
            rsync_job_configuration.working_directory = rsync_constants.manual_working_dir
        }
        else if(options['chown'])
            rsync_job_configuration.command = ['sh', '-c', `${rsync_base_command} && chown -R ${options['chown']}:${options['chown']} ${rsync_constants.dest_dir}`]
        else
            rsync_job_configuration.command = ['sh', '-c', rsync_base_command]
        // -- start rsync job --------------------------------------------------
        return new ValidatedOutput(true, undefined).absorb(
            job_manager.container_drivers.runner.jobStart(
                rsync_job_configuration,
                'inherit'
            )
        )
    }

    // Removed any include or exclude files that don't exist or aren't absolute paths
    private filterRsyncIncludeExclude(files?: RsyncIncludeExclude) : void
    {
        if(!files) 
            return
    
        const remFilter = (p?:string) => (p && (!path.isAbsolute(p) || !FileTools.existsFile(p)));
        (["include", "exclude"] as Array<keyof RsyncIncludeExclude>).map((key:keyof RsyncIncludeExclude) => {
            if(remFilter(files?.[key]))
                delete files[key]
        })
    }

    // -----------------------------------------------------------------------------
    // RSYNCCONFIGURATION helper function that creates an new configuration for the
    // rsync job that either copies files from host to container or from container
    // to host
    // -- Parameters ---------------------------------------------------------------
    // runner: RunDriver - run driver that will be used to run job
    // copy_direction: string - specified which direction the copy is going. It can
    //                          either be "to-host" or "to-container"
    // -----------------------------------------------------------------------------
    private rsyncStackConfiguration(config: Configurations, direction: "to-host"|"to-volume", copy_options: VolumeRsyncOptions) : StackConfiguration<any>
    {
        const rsync_stack_configuration = config.stack()

        rsync_stack_configuration.setImage(rsync_constants.image)
        if(direction == "to-host")
        {
            rsync_stack_configuration.addVolume(copy_options["volume"], rsync_constants.source_dir)
            rsync_stack_configuration.addBind(copy_options["host-path"], rsync_constants.dest_dir)
        }
        else if(direction == "to-volume")
        {
            rsync_stack_configuration.addVolume(copy_options["volume"], rsync_constants.dest_dir)
            rsync_stack_configuration.addBind(copy_options["host-path"], rsync_constants.source_dir)
        }

        this.addRsyncIncludeExcludeBinds(rsync_stack_configuration, copy_options.files)

        return rsync_stack_configuration
    }


    private addRsyncIncludeExcludeBinds(rsync_configuration: StackConfiguration<any>, files?: {include?: string, exclude?: string})
    {
        if(files?.include) 
            rsync_configuration.addBind(files.include, path.posix.join(rsync_constants['config_dir'], rsync_constants['include_file_name']))
        if(files?.exclude) 
            rsync_configuration.addBind(files.exclude, path.posix.join(rsync_constants['config_dir'], rsync_constants['exclude_file_name']))   
    }

    private addRsyncIncludeExcludeFlags(rsync_flags: Dictionary, rules: undefined|{include?: Array<string>, exclude?: Array<string>}, files: undefined|{include?: string, exclude?: string})
    {
        // note: always add include before exclude
        if(files?.include) 
            rsync_flags[`include-from`] = path.posix.join(rsync_constants['config_dir'], rsync_constants['include_file_name'])
        if(rules?.include)
            rsync_flags[`include`] = rules.include
        if(files?.exclude) 
            rsync_flags[`exclude-from`] = path.posix.join(rsync_constants['config_dir'], rsync_constants['exclude_file_name'])
        if(rules?.exclude)
            rsync_flags[`exclude`] = rules.exclude
    }

    private rsyncCommandString(source: string, destination: string, flags: Dictionary)
    {
        const shell = new ShellCommand(false, false)
        const args  = [source, destination]
        return shell.commandString('rsync', flags, args)
    }
    
}