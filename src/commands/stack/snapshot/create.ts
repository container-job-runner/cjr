import { flags } from '@oclif/command'
import { JobCommand } from '../../../lib/commands/job-command';
import { StackConfiguration } from '../../../lib/config/stacks/abstract/stack-configuration';
import { DockerStackConfiguration } from '../../../lib/config/stacks/docker/docker-stack-configuration';
import { augmentImagePushParameters, initX11, promptUserToSnapshot } from '../../../lib/functions/cli-functions';
import { printValidatedOutput } from '../../../lib/functions/misc-functions';
import { ContainerDrivers } from '../../../lib/job-managers/abstract/job-manager';
import { ArchiveSnapshot } from '../../../lib/snapshots/archive-snapshot';
import { RegistrySnapshot } from '../../../lib/snapshots/registry-snapshot';
import { ValidatedOutput } from '../../../lib/validated-output';

export default class SnapshotCreate extends JobCommand {
  static description = 'create a new stack snapshot.'
  static args = [{name: 'stack'}]
  static flags = {
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
  }
  static strict = true;

  async run()
  {
    const { flags, args } = this.parse(SnapshotCreate)
    if( args["stack"] ) flags["stack"] = args["stack"]
    this.augmentFlagsWithProjectSettings(flags, {"stack": true, "stacks-dir": false})

    // -- verify that stack supports snapshots ---------------------------------
    const load = this.createStack( { ... flags, ... { quiet: false } })
    if ( ! load.success ) return printValidatedOutput(load)
    
    const snapshot_options = load.value.stack_configuration.getSnapshotOptions()
    if(snapshot_options == undefined)
        this.error(`The stack ${flags['stack']} does not support snapshots`)

    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'debug': flags.debug
        })
    // -- run basic job --------------------------------------------------------
    const shell_flags = {
      "quiet": false,
      "file-access": "shared",
      "label": [],
      "sync": true,
      "remove-on-exit": false
    }
    const {job, job_data} = this.runSimpleJob(
      { ... flags, ... shell_flags},
      [this.settings.get("default-container-shell")]
    )

    if( ! job.success && ! job_data.success ) {
        printValidatedOutput(job_data)
        printValidatedOutput(job)
        return;
    }

    if( ( snapshot_options['mode'] !== "prompt" ) || (await promptUserToSnapshot(this.settings.get('interactive')))) {
      const snapshot = await this.updateSnapshot(
        job.value.id,
        job_data.value.stack_configuration,
        job_data.value.job_manager.container_drivers
      )
      printValidatedOutput(snapshot)
      job_data.value.job_manager.container_drivers.runner.jobDelete([job.value.id])
    }
  }

  async updateSnapshot(job_id: string, job_stack_configuration: StackConfiguration<any>, drivers: ContainerDrivers) : Promise<ValidatedOutput<undefined>>
  {
    const failure = new ValidatedOutput(false, undefined)
    
    // -- currently only support DockerStackConfiguration ----------------------  
    if( !(job_stack_configuration instanceof DockerStackConfiguration) )
        return failure
    
    const snapshot_options = job_stack_configuration.getSnapshotOptions();

    if(snapshot_options?.["storage-location"] == "registry")
    {
        await augmentImagePushParameters(snapshot_options.auth)
        return await (new RegistrySnapshot(drivers, true)).snapshot({
            "job-id": job_id,
            "registry-options": snapshot_options
        })
    }
    else if(snapshot_options?.["storage-location"] == "archive")
    {
        return await (new ArchiveSnapshot(drivers, true)).snapshot({
            "job-id": job_id,
            "stack-path": job_stack_configuration.stack_path || ""
        })
    }

    return failure
    
  }

}