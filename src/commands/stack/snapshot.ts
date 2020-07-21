import { flags } from '@oclif/command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { initX11, snapshot, promptUserToSnapshot, augmentImagePushParameters } from '../../lib/functions/cli-functions'
import { JobCommand } from '../../lib/commands/job-command'
import { StackConfiguration } from '../../lib/config/stacks/abstract/stack-configuration'
import { ContainerDrivers, OutputOptions } from '../../lib/job-managers/abstract/job-manager'
import { ValidatedOutput } from '../../lib/validated-output'

export default class Snapshot extends JobCommand {
  static description = 'Start an interactive shell for development on localhost.'
  static args = [{name: 'stack'}]
  static flags = {
    "stack": flags.string({env: 'STACK'}),
    "project-root": flags.string({env: 'PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.'}),
    "explicit": flags.boolean({default: false}),
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
    const { flags, args } = this.parse(Snapshot)
    flags["stack"] = args?.['stack'] || flags["stack"]
    this.augmentFlagsWithProjectSettings(flags, {"stack": true, "stacks-dir": false})

    // -- verify that stack supports snapshots ----------------------------------
    const load = this.createStack( { ... flags, ... { quiet: false } })
    const snapshot_options = load.value.stack_configuration.getSnapshotOptions()
    if(snapshot_options == undefined)
        this.error(`The stack ${flags['stack']} does not support snapshots`)

    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })
    // -- run basic job --------------------------------------------------------
    const shell_flags = {
      "quiet": false,
      "file-access": "bind",
      "label": [],
      "sync": true,
      "remove-on-exit": false
    }
    const {job, job_data} = this.runSimpleJob(
      { ... flags, ... shell_flags},
      [this.settings.get("default-container-shell")]
    )
    if(job.success && job_data.success) {
      const snapshot = await this.updateSnapshot(
        job.value.id,
        job_data.value.stack_configuration,
        job_data.value.job_manager.container_drivers,
        job_data.value.job_manager.output_options,
      )
      printValidatedOutput(snapshot)
      job_data.value.job_manager.container_drivers.runner.jobDelete([job.value.id])
    }
    printValidatedOutput(job_data)
    printValidatedOutput(job)
  }

  async updateSnapshot(job_id: string, stack_configuration: StackConfiguration<any>, drivers: ContainerDrivers, output_options: OutputOptions) : Promise<ValidatedOutput<undefined>>
  {
    const vPrint = (s:string, newline: boolean = true) => (output_options.quiet) ? undefined : ((newline) ? console.log(s) : process.stdout.write(s))
    const snapshot_options = stack_configuration.getSnapshotOptions();

    if(snapshot_options === undefined)
      return new ValidatedOutput(false, undefined)

    if(snapshot_options['mode'] === "prompt" && !(await promptUserToSnapshot(this.settings.get('interactive'))))
      return new ValidatedOutput(true, undefined)

    vPrint("Saving snapshot...", false)
    const registry_options = {
      "username": snapshot_options.username || this.settings.get('container-registry-user'),
      "server": snapshot_options.server || this.settings.get('container-registry'),
      "token": snapshot_options.token
    }

    await augmentImagePushParameters(registry_options)
    const result = snapshot(job_id, stack_configuration, drivers, registry_options)
    vPrint("done")
    return result
  }

}
