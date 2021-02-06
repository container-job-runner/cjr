import { flags } from '@oclif/command'
import { JobCommand } from '../../../lib/commands/job-command';
import { StackConfiguration } from '../../../lib/config/stacks/abstract/stack-configuration';
import { DockerStackConfiguration } from '../../../lib/config/stacks/docker/docker-stack-configuration';
import { printValidatedOutput, printVerticalTable } from '../../../lib/functions/misc-functions';
import { ContainerDrivers } from '../../../lib/job-managers/abstract/job-manager';
import { ArchiveSnapshot } from '../../../lib/snapshots/archive-snapshot';
import { RegistrySnapshot } from '../../../lib/snapshots/registry-snapshot';
import { ValidatedOutput } from '../../../lib/validated-output';

export default class SnapshotCreate extends JobCommand {
  static description = 'list all previous stack snapshots.'
  static args = [{name: 'stack'}, {name : 'tag'}]
  static flags = {
    "stack": flags.string({env: 'CJR_STACK'}),
    "debug": flags.boolean({default: false}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "tag": flags.string({required: true})
  }
  static strict = true;

  async run()
  {
 
    const { flags, args } = this.parse(SnapshotCreate)
    if( args["stack"] ) flags["stack"] = args["stack"]
    this.augmentFlagsWithProjectSettings(flags, {"stack": true, "stacks-dir": false})

    // -- verify that stack supports snapshots ---------------------------------
    const load = this.createStack( { ... flags, ... { quiet: false, "working-directory": "", "x11": false, "build-mode": "reuse-image" } })
    if ( ! load.success ) return printValidatedOutput(load)
    
    const stack_configuration = load.value.stack_configuration
    if(stack_configuration.getSnapshotOptions() === undefined)
        this.error(`The stack ${flags['stack']} does not support snapshots`)

    printValidatedOutput(
        await this.revertSnapshot(flags["tag"], stack_configuration, load.value.job_manager.container_drivers)
    )

  }

  async revertSnapshot(tag: string, stack_configuration: StackConfiguration<any>, drivers: ContainerDrivers) : Promise<ValidatedOutput<undefined>>
  {
    const failure = new ValidatedOutput(false, undefined)
    
    // -- currently only support DockerStackConfiguration ----------------------  
    if( !(stack_configuration instanceof DockerStackConfiguration) )
        return failure

    const snapshot_options = stack_configuration.getSnapshotOptions();

    if(snapshot_options?.["storage-location"] == "registry")
    {
        return await (new RegistrySnapshot(drivers, true)).revert({
            "tag": tag,
            "registry-options": snapshot_options
        })
    }
    else if(snapshot_options?.["storage-location"] == "archive")
    {
        return await (new ArchiveSnapshot(drivers, true)).revert({
            "tag": tag,
            "stack-path": stack_configuration.stack_path || ""
        })
    }

    return failure
    
  }


//   async revertSnapshot(snapshot_manager: AbstractSnapshot, stack_configuration: DockerStackConfiguration,  tag: string) : Promise<ValidatedOutput<undefined>>
//   {
//     const failure = new ValidatedOutput(false, undefined)
//     if( !(stack_configuration instanceof DockerStackConfiguration) )
//         return failure
    
//     if(snapshot_manager instanceof RegistrySnapshot)
//     {
//         const snapshot_options = stack_configuration.getSnapshotOptions();
//         if(snapshot_options === undefined) return failure
        
        
//         return await snapshot_manager.revert({
//             "tag": tag,
//             "registry-options": snapshot_options
//         })
//     }
//     else if(snapshot_manager instanceof ArchiveSnapshot)
//     {
//         return await snapshot_manager.revert({
//             "tag": tag,
//             "stack-path": stack_configuration.stack_path || ""
//         })
//     }

//     return failure
    
//   }

//   // create new command class SnapshotCommand and add the following function

//   newSnapshotManager(stack_configuration: StackConfiguration<any>, drivers: ContainerDrivers) : ValidatedOutput<AbstractSnapshot>
//   {
//     const failure = new ValidatedOutput(false, new ArchiveSnapshot(drivers, true))
    
//     const snapshot_options = stack_configuration.getSnapshotOptions();
//     if(snapshot_options === undefined)
//         return failure

//     let snapshot_manager : AbstractSnapshot | undefined = undefined
    
//     if(snapshot_options["storage-location"] == "registry")
//         snapshot_manager = new RegistrySnapshot(drivers, true)
//     else if(snapshot_options["storage-location"] == "archive")
//         snapshot_manager = new ArchiveSnapshot(drivers, true)

//     return (snapshot_manager == undefined) ? 
//         failure :
//         new ValidatedOutput(true, snapshot_manager)

//   }

}