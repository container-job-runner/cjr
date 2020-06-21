import path = require('path')
import { flags } from '@oclif/command'
import { ValidatedOutput } from '../../../lib/validated-output'
import { RemoteCommand, Dictionary } from '../../../lib/remote/commands/remote-command'
import { SshShellCommand } from '../../../lib/remote/ssh-shell-command'
import { printValidatedOutput, parseJSON } from '../../../lib/functions/misc-functions'
import { PathTools } from '../../../lib/fileio/path-tools'
import { remote_sshsocket_dirname } from '../../../lib/remote/constants'

export default class Rsync extends RemoteCommand {
  static description = 'rsyncs local stacks-dir with remote resource or vice-versa.'
  static args = [{name: 'remote-name'}]
  static flags = {
    "remote-name": flags.string({env: 'REMOTENAME'}),
    "direction": flags.string({options: ['push', 'pull'], required: true, description: 'push syncs local stacks to remote, pull sync remote stacks to local'}),
    "mirror": flags.boolean({default: false, description: 'if selected all files on destination that are not also on the source will be deleted'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "explicit": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: "shows rsync output."})
  }
  static strict = false;

  async run()
  {
    const { flags, args } = this.parse(Rsync)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": false, "stacks-dir": false})
    // -- validate id ----------------------------------------------------------
    const name = args["remote-name"] || flags["remote-name"] || ""
    var result:ValidatedOutput<any> = this.validResourceName(name)
    if(!result.success) return printValidatedOutput(result)
    // -- get resource & ssh_shell ---------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const ssh_shell = new SshShellCommand(flags.explicit, false, path.join(this.config.dataDir, remote_sshsocket_dirname))
    result = ssh_shell.setResource(resource)
    if(!result.success) return printValidatedOutput(result)
    // -- get local stack dir --------------------------------------------------
    const local_stacks_dir:string = flags['stacks-dir'] || this.settings.get('stacks-dir')
    if(!local_stacks_dir) return printValidatedOutput(new ValidatedOutput(false, undefined).pushError('Empty local stack dir'))
    // -- get remote stack_dir -------------------------------------------------
    result = this.getRemoteStackDir(ssh_shell)
    if(!result.success) printValidatedOutput(result)
    const remote_stacks_dir:string = result.value
    // -- sync stacks ----------------------------------------------------------
    const rsync_flags:Dictionary = {a: {}}
    if(flags.mirror) rsync_flags['delete'] = {}
    if(flags.verbose) rsync_flags['v'] = {}
    ssh_shell.rsync(
      PathTools.addTrailingSeparator(local_stacks_dir),
      PathTools.addTrailingSeparator(remote_stacks_dir),
      (flags.direction as "push"|"pull"),
      rsync_flags
    )
  }

  getRemoteStackDir(ssh_shell: SshShellCommand)
  {
    var result = parseJSON(ssh_shell.output('cjr config:ls', {json: {}}, [], {}))
    if(!result.success) return result
    const remote_stacks_dir:string = result.value?.['stacks-dir'] || ""
    if(!remote_stacks_dir) return new ValidatedOutput(false, undefined).pushError('Empty remote stack dir.')
    return new ValidatedOutput(true, remote_stacks_dir)
  }

}
