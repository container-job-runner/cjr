import { flags } from '@oclif/command'
import { JobCommand } from '../../../lib/commands/job-command';
import { DockerStackConfiguration, DockerStackSnapshotOptions } from '../../../lib/config/stacks/docker/docker-stack-configuration';
import { augmentImagePushParameters, initX11, promptUserToSnapshot } from '../../../lib/functions/cli-functions';
import { printValidatedOutput } from '../../../lib/functions/misc-functions';
import { JobManager } from '../../../lib/job-managers/abstract/job-manager';
import { ArchiveSnapshot } from '../../../lib/snapshots/archive-snapshot';
import { RegistrySnapshot } from '../../../lib/snapshots/registry-snapshot';
import { ValidatedOutput } from '../../../lib/validated-output';

type SnapshotCreateFlags = {
    "resource"?: string,
    "stack"?: string,
    "project-root"?: string,
    "here"?: boolean,
    "profile"?: Array<string>,
    "config-files": Array<string>,
    "debug": boolean,
    "verbose": boolean,
    "port"?: Array<string>,
    "x11": boolean,
    "no-autoload": boolean,
    "stacks-dir": string,
    "working-directory": string
    "build-mode":  string
}

export default class SnapshotCreate extends JobCommand {
  static description = 'create a new stack snapshot.'
  static args = [{name: 'stack'}]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "stack": flags.string({env: 'CJR_STACK'}),
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "debug": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "x11": flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "no-cache": flags.boolean({default: false}),
    "pull": flags.boolean({default: false}),
  }
  static strict = true;

    async run()
    {
        const { flags, args } = this.parse(SnapshotCreate)
        if( args["stack"] ) flags["stack"] = args["stack"]
        this.augmentFlagsWithProjectSettings(flags, {"stack": true, "stacks-dir": false})

        // -- load stack -------------------------------------------------------
        const stack_data = this.createStack( { ... flags, ... { quiet: false } } );
        if( ! stack_data.success ) return stack_data
        
        const { job_manager, stack_configuration } = stack_data.value
        if( !(stack_configuration instanceof DockerStackConfiguration) )
            return printValidatedOutput(
                new ValidatedOutput(false, undefined).pushError("Unsupported Stack Type")
            )

        // -- load snapshot options --------------------------------------------
        const snapshot_options = stack_configuration.getSnapshotOptions();
        if( snapshot_options === undefined )
            return printValidatedOutput(
                new ValidatedOutput(false, undefined).pushError(`The stack ${flags['stack']} does not support snapshots`)
            )

        // -- create new snapshot ----------------------------------------------
        if( snapshot_options.source === "container" )
            printValidatedOutput(
                await this.snapshotFromContainer( snapshot_options, flags )
            )
        else if( snapshot_options.source === "dockerfile" )
            printValidatedOutput(
                await this.snapshotFromDockerfile(
                    stack_configuration, job_manager, flags
                )
            )
    }

    async snapshotFromContainer( snapshot_options: DockerStackSnapshotOptions, flags: SnapshotCreateFlags ) : Promise<ValidatedOutput<any>>
    {
        // -- check x11 user settings -----------------------------------------
        if(flags['x11']) await initX11({
                'interactive': this.settings.get('interactive'),
                'xquartz': this.settings.get('xquartz-autostart'),
                'debug': flags.debug
            })
        // -- run basic job ---------------------------------------------------
        const extra_flags = {
            "quiet": false,
            "file-access": "shared",
            "label": [],
            "sync": true,
            "remove-on-exit": false
        }
        const {job, job_data} = this.runSimpleJob(
            { ... flags, ... extra_flags},
            [this.settings.get("default-container-shell")]
        )

        if( ! job.success && ! job_data.success )
            return job.absorb(job_data)

        // -- exit if user discards snapshot ----------------------------------
        if( ( snapshot_options['mode'] === "prompt" ) && !( await promptUserToSnapshot(this.settings.get('interactive')) ) )
            return new ValidatedOutput(true, undefined)

        // -- update snapshot -------------------------------------------------
        const container_drivers = job_data.value.job_manager.container_drivers
        if( snapshot_options?.["storage-location"] === "registry" )
        {
            await augmentImagePushParameters(snapshot_options.auth)
                return await (new RegistrySnapshot(container_drivers, true)).snapshotFromJob({
                    "job-id": job.value.id,
                    "registry-options": snapshot_options
                })   
        }
        else if( snapshot_options?.["storage-location"] == "archive" )
        {
            return await (new ArchiveSnapshot(container_drivers, true)).snapshotFromJob({
                    "job-id": job.value.id,
                    "stack-path": job_data.value.stack_configuration.stack_path || ""
                }) 
        }

        return new ValidatedOutput(false, undefined)
    }

    async snapshotFromDockerfile( stack_configuration: DockerStackConfiguration, job_manager: JobManager, flags: {'pull' ?: boolean, 'no-cache' ?: boolean} ) : Promise<ValidatedOutput<any>>
    {
        // -- build stack (force Dockerfile build) ----------------------------
        const build_configuration = stack_configuration.copy();
        build_configuration.stack_type = "dockerfile" // force dockerfile stack
        if(flags["pull"]) build_configuration.addBuildFlag('pull')
        if(flags["no-cache"]) build_configuration.addBuildFlag('no-cache')
        const build_request = job_manager.build(build_configuration, {"reuse-image": false, verbose: true})
        if(!build_request.success) return build_request

        // -- update snapshot -------------------------------------------------
        const snapshot_options = stack_configuration.getSnapshotOptions();
        if( snapshot_options === undefined )
            return new ValidatedOutput(false, undefined)

        if( snapshot_options?.["storage-location"] === "registry" )
        {
            await augmentImagePushParameters(snapshot_options.auth)
                return await (new RegistrySnapshot(job_manager.container_drivers, true)).snapshotFromImage({
                    "image": build_configuration.getImage(),
                    "registry-options": snapshot_options
                })   
        }
        else if( snapshot_options?.["storage-location"] == "archive" )
        {
            return await (new ArchiveSnapshot(job_manager.container_drivers, true)).snapshotFromImage({
                    "image": stack_configuration.getImage(),
                    "stack-path": stack_configuration.stack_path || ""
                }) 
        }

        return new ValidatedOutput(false, undefined)
    }
}