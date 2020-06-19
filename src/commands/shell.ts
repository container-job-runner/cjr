import { flags } from '@oclif/command'
import { printValidatedOutput } from '../lib/functions/misc-functions'
import { initX11, snapshot, promptUserToSnapshot, augmentImagePushParameters } from '../lib/functions/cli-functions'
import { LocalJobCommand } from '../lib/commands/local-job-command'
import { StackConfiguration } from '../lib/config/stacks/abstract/stack-configuration'
import { ContainerDrivers, OutputOptions } from '../lib/job-managers/abstract/job-manager'

export default class Shell extends LocalJobCommand {
  static description = 'Start an interactive shell for developing in a stack container.'
  static args = []
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
    "snapshot": flags.boolean({default: false, description: "changes will written to new snapshot; only affects stacks with snapshot flag."})
  }
  static strict = true;

  async run()
  {
    const {flags} = this.parse(Shell)
    // -- check x11 user settings ----------------------------------------------
    if(flags['x11']) await initX11(this.settings.get('interactive'), flags.explicit)
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
      [this.settings.get("container-default-shell")]
    )
    if(job.success && job_data.success) {
      await this.updateSnapshot(
        job.value.id,
        job_data.value.stack_configuration,
        job_data.value.container_drivers,
        job_data.value.output_options,
        flags['snapshot']
      )
      job_data.value.container_drivers.runner.jobDelete([job.value.id])
    }
    printValidatedOutput(job_data)
    printValidatedOutput(job)
  }

  async updateSnapshot(job_id: string, stack_configuration: StackConfiguration<any>, drivers: ContainerDrivers, output_options: OutputOptions, cli_snapshot_flag: boolean)
  {
    const vPrint = (s:string, newline: boolean = true) => (output_options.quiet) ? undefined : ((newline) ? console.log(s) : process.stdout.write(s))
    const snapshot_options = stack_configuration.getSnapshotOptions();

    if(snapshot_options === undefined)
      return

    if(snapshot_options['mode'] === "off")
      return

    if(snapshot_options['mode'] === "flag" && !cli_snapshot_flag)
      return

    if(snapshot_options['mode'] === "prompt" && !(await promptUserToSnapshot(this.settings.get('interactive'))))
      return

    vPrint("Saving snapshot...", false)
    const registry_options = {
      "username": snapshot_options.username || this.settings.get('container-registry-user'),
      "server": snapshot_options.server || this.settings.get('container-registry'),
      "token": snapshot_options.token
    }

    await augmentImagePushParameters(registry_options)
    snapshot(job_id, stack_configuration, drivers, registry_options)
    vPrint("done")
  }

}
