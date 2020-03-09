// =============================================================================
// ShellCMD: A class for launching sync and async commands
// Description: All class functions have identical calling sequence
//  command: string       - base commands
//  args: array<string>   - strings of arguments
//  flags: object         - keys are flag names and entries must have structure
//                            {value: string or [], shorthand: boolean, santitize ? boolean}
//                          if shorthand = true flag coorespond to
//                              -key=value or -key=value[1] -key=value[3]
//                          if shorhand = false then
//                              --key=value or -key=value[0] -key=value[1] ...
// =============================================================================

import * as path from 'path'
import * as fs from 'fs-extra'
import * as os from 'os'
import {ValidatedOutput} from '../validated-output'
import {JSTools} from '../js-tools'
import {FileTools} from '../fileio/file-tools'
import {ShellCommand} from '../shell-command'
import {remote_sshsocket_dirname} from './constants'
type Dictionary = {[key: string]: any}

export class SshShellCommand
{
    shell: ShellCommand
    resource: Dictionary = {}
    multiplex: boolean = true
    cli_data_dir: string

    constructor(explicit: boolean, silent: boolean, cli_data_dir: string)
    {
      this.cli_data_dir = cli_data_dir
      this.shell = new ShellCommand(explicit, silent)
    }

    setResource(resource: Dictionary)
    {
      const result = new ValidatedOutput(true)
      const base_message = "Internal Error: sshShellCommand invalid remote resource "
      if(!JSTools.isString(resource?.username) || !resource.username)
        result.pushError(`${base_message} (bad username).`)
      if(!JSTools.isString(resource?.address) || !resource.address)
        result.pushError(`${base_message} (bad address).`)
      if(resource?.key && !JSTools.isString(resource.key))
        result.pushError(`${base_message} (bad key).`)
      if(result.success) this.resource = resource
      return result
    }

    commandString(command: string, flags: Dictionary={}, args: Array<string>=[], options: Dictionary = {})
    {
      const {ssh_flags, ssh_args} = this.sshFlagsAndArgs(command, flags, args, options)
      return this.shell.commandString('ssh', ssh_flags, ssh_args)
    }

    // set post_process format to trim by default
    output(command: string, flags: Dictionary, args: Array<string>, options:Dictionary = {}, post_process="trim")
    {
      const {ssh_flags, ssh_args} = this.sshFlagsAndArgs(command, flags, args, options)
      return this.shell.output('ssh', ssh_flags, ssh_args, options, post_process)
    }

    // set post_process format to trim by default
    exec(command: string, flags: Dictionary, args: Array<string>, options:Dictionary = {})
    {
      const {ssh_flags, ssh_args} = this.sshFlagsAndArgs(command, flags, args, options)
      return this.shell.exec('ssh', ssh_flags, ssh_args, options)
    }

    private sshFlagsAndArgs(command: string, flags: Dictionary={}, args: Array<string>=[], options: Dictionary = {})
    {
      const use_multiplex = (this.multiplex && this.multiplexSocketExists())
      var ssh_flags:Dictionary = {}
      if(options?.ssh?.interactive) {
        ssh_flags.t = {}
        ssh_flags.o = "LogLevel=QUIET"
      }
      if(options?.ssh?.x11) {
        const platform = os.platform()
        if(platform === 'darwin') ssh_flags.Y = {}
        else if(platform === 'linux') ssh_flags.X = {}
      }
      if(!use_multiplex && this.resource.key) // no resource needed if socket exists
        ssh_flags.i = {value: this.resource.key, noequals: true}
      if(use_multiplex)
        ssh_flags.S = {value: this.multiplexSocketPath(), noequals: true}
      const ssh_args = [`${this.resource.username}@${this.resource.address}`]
      if(command) ssh_args.push(this.shell.commandString(command, flags, args, options))
      return {ssh_flags: ssh_flags, ssh_args: ssh_args}
    }

    // === File Transfer Functions  ============================================

    scp(local_path: string, remote_path: string, direction: string, options: Dictionary = {})
    {
      if(!["push", "pull"].includes(direction)) return new ValidatedOutput(false, [], ['Internal Error: SshShellCommand.scp() was passed an invalid direction string']);
      const use_multiplex = (this.multiplex && this.multiplexSocketExists())
      // -- set flags ----------------------------------------------------------
      var flags:Dictionary = {r: {}, p: {}}
      if(!use_multiplex && this.resource.key) // no resource needed if socket exists
        flags.i = {value: this.resource.key, noequals: true}
      if(use_multiplex)
        flags.o = `ControlPath=${this.multiplexSocketPath()}`
      // -- set args -----------------------------------------------------------
      const escaped_remote_path = `${this.resource.username}@${this.resource.address}:${ShellCommand.bashEscape(remote_path)}` // NOTE: remote arguments must be escaped twice, since they are resolved on host and on remote. Since shell-command already escapes arguments we only do it once here
      const args = (direction === "push") ?
        [local_path, escaped_remote_path] : //push
        [escaped_remote_path, local_path]   //pull
      return this.shell.exec("scp", flags, args, options)
    }

    rsync(local_path: string, remote_path: string, direction: string, flags: Dictionary, options: Dictionary = {})
    {
      if(!["push", "pull"].includes(direction)) return new ValidatedOutput(false, [], ['Internal Error: SshShellCommand.scp() was passed an invalid direction string']);
      const use_multiplex = (this.multiplex && this.multiplexSocketExists())
      // -- set flags ----------------------------------------------------------
      if(!use_multiplex && this.resource.key) // no resource needed if socket exists
        flags.e = `ssh -i "${this.resource.key}"`
      if(use_multiplex)
        flags.e = `ssh -o 'ControlPath=${this.multiplexSocketPath()}'`
      // -- set args -----------------------------------------------------------
      const escaped_remote_path = `${this.resource.username}@${this.resource.address}:${ShellCommand.bashEscape(remote_path)}` // NOTE: remote arguments must be escaped twice, since they are resolved on host and on remote. Since shell-command already escapes arguments we only do it once here
      const args = (direction === "push") ?
        [local_path, escaped_remote_path] : //push
        [escaped_remote_path, local_path]   //pull
      return this.shell.exec("rsync", flags, args, options)
    }

    // === Multiplex Commands ==================================================

    multiplexStart(options:Dictionary={}) // start the multiplex master
    {
      if(this.multiplexSocketExists()) return true
      fs.ensureDirSync(path.dirname(this.multiplexSocketPath()))

      const command = "ssh"
      const flags:Dictionary = {
        M: {}, // set as master for multiplexer
        N: {}, // No command (does not execute anything over ssh)
        f: {}, // send to background
        o: {value: "ExitOnForwardFailure yes", noequals: true}, // does not sent process to background until connection is established
        S: {value: this.multiplexSocketPath(), noequals: true} // location of socket
      }
      if(options?.x11) {
        const platform = os.platform()
        if(platform === 'darwin') flags.Y = {}
        else if(platform === 'linux') flags.X = {}
      }
      if(this.resource.key) flags.i = {value: this.resource.key, noequals: true}
      const args = [`${this.resource.username}@${this.resource.address}`]
      this.shell.exec(command, flags, args, {stdio: 'ignore'})
    }

    multiplexStop() // stop the multiplex master
    {
      if(!this.multiplexSocketExists()) return true
      const command = 'ssh'
      const flags = {
        O: {value: 'stop', noequals: true}, // Control multiplex. Request stop
        S: {value: this.multiplexSocketPath(), noequals: true} // location of socket
      }
      const args = [`${this.resource.username}@${this.resource.address}`]
      const result = this.shell.exec(command, flags, args, {stdio: 'ignore'})
      return (result.success && !this.multiplexSocketExists())
    }

    private multiplexSocketPath() // returns name of multiplex socket
    {
      return path.join(this.cli_data_dir, remote_sshsocket_dirname, `${this.resource.username}@${this.resource.address}:22`)
    }

    private multiplexSocketExists() // returns true if multiplex socket file exists
    {
        return fs.existsSync(this.multiplexSocketPath())
    }

}
