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
  static args = [{name: 'stack'}]
  static flags = {
    "stack": flags.string({env: 'CJR_STACK'}),
    "debug": flags.boolean({default: false}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"})
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

    const request_snapshots = await this.getSnapshots(stack_configuration, load.value.job_manager.container_drivers)
    if( ! request_snapshots.success ) return printValidatedOutput(request_snapshots)

    const toDataArray = (s:string) => [s, new Date(parseInt(s)).toLocaleString("en-US", { hour12: false })];
    printVerticalTable({
        column_headers: ["TAG", "DATE"],
        column_widths:  [20, 20],
        text_widths:    [16, 20],
        silent_clip:    [true, true],
        data: request_snapshots.value.map(toDataArray)
    })

  }

  async getSnapshots(stack_configuration: StackConfiguration<any>, drivers: ContainerDrivers) : Promise<ValidatedOutput<string[]>>
  {
    const failure = new ValidatedOutput(false, [])
    
    // -- currently only support DockerStackConfiguration ----------------------  
    if( !(stack_configuration instanceof DockerStackConfiguration) )
        return failure
    
    const snapshot_options = stack_configuration.getSnapshotOptions();

    if(snapshot_options?.["storage-location"] == "registry")
    {
        return await (new RegistrySnapshot(drivers, true)).list({
            "registry-options": snapshot_options
        })
    }
    else if(snapshot_options?.["storage-location"] == "archive")
    {
        return await (new ArchiveSnapshot(drivers, true)).list({
            "stack-path": stack_configuration.stack_path || ""
        })
    }

    return failure
    
  }

}