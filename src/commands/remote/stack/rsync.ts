import {flags} from '@oclif/command'
import {ValidatedOutput} from '../../../lib/validated-output'
import {RemoteCommand, Dictionary} from '../../../lib/remote/commands/remote-command'
import {FileTools} from '../../../lib/fileio/file-tools'
import {SshShellCommand} from '../../../lib/remote/ssh-shell-command'
import {printResultState} from '../../../lib/functions/misc-functions'

export default class Rsync extends RemoteCommand {
  static description = 'rsyncs local stacks-dir with remote resource or vice-versa.'
  static args = [{name: 'remote-name'}]
  static flags = {
    'remote-name': flags.string({env: 'REMOTENAME'}),
    direction: flags.string({options: ['push', 'pull'], required: true, description: 'push syncs local stacks to remote, pull sync remote stacks to local'}),
    mirror: flags.boolean({default: false, description: 'if selected all files on destination that are not also on the source will be deleted'}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    explicit: flags.boolean({default: false}),
    verbose: flags.boolean({default: false})
  }
  static strict = false;

  async run()
  {
    const {flags, args, argv} = this.parse(Rsync)
    this.augmentFlagsWithProjectSettings(flags, {"remote-name": false, "stacks-dir": false})
    // -- validate id ----------------------------------------------------------
    const name = args["remote-name"] || flags["remote-name"] || ""
    var result = this.validResourceName(name)
    if(!result.success) return printResultState(result)
    // -- get resource & ssh_shell ---------------------------------------------
    const resource = this.resource_configuration.getResource(name)
    if(resource === undefined) return
    const ssh_shell = new SshShellCommand(flags.explicit, false, this.config.dataDir)
    result = ssh_shell.setResource(resource)
    if(!result.success) return printResultState(result)
    // -- get local stack dir --------------------------------------------------
    const local_stacks_dir:string = flags['stacks-dir'] || this.settings.get('stacks-dir')
    if(!local_stacks_dir) return printResultState(new ValidatedOutput(false).pushError('Empty local stack dir'))
    // -- get remote stack_dir -------------------------------------------------
    result = this.getRemoteStackDir(ssh_shell)
    if(!result.success) printResultState(result)
    const remote_stacks_dir:string = result.data
    // -- sync stacks ----------------------------------------------------------
    const rsync_flags:Dictionary = {a: {}}
    if(flags.mirror) rsync_flags['delete'] = {}
    if(flags.verbose) rsync_flags['v'] = {}
    ssh_shell.rsync(
      FileTools.addTrailingSeparator(local_stacks_dir),
      FileTools.addTrailingSeparator(remote_stacks_dir),
      (flags.direction as "push"|"pull"),
      rsync_flags
    )
  }

  getRemoteStackDir(ssh_shell: SshShellCommand)
  {
    var result = ssh_shell.output('cjr config:list', {json: {}}, [], {}, 'json')
    if(!result.success) return result
    const remote_stacks_dir:string = result.data?.['stacks-dir'] || ""
    if(!remote_stacks_dir) return new ValidatedOutput(false).pushError('Empty remote stack dir.')
    return new ValidatedOutput(true, remote_stacks_dir)
  }

}
