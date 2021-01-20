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

import os = require('os')
import fs = require('fs-extra')
import path = require('path')
import { ValidatedOutput } from './validated-output'
import { ShellCommand } from './shell-command'
import { SpawnSyncReturns } from 'child_process'
import { trim } from './functions/misc-functions'
import { JSTools } from './js-tools'

type Dictionary = { [key: string]: any }
type Resource = { "username": string, "address": string, "key"?:string }
type SshOptions = { interactive?: boolean, x11?: boolean } // options pertaining to ssh connections
type MultiplexOptions = { x11?: boolean, tag?: string, controlpersist?: number} // options for ssh multiplex master
type SshShellOptions = Dictionary & { ssh?: SshOptions, multiplex?: MultiplexOptions } // options that users can specify

type SshTunnelOptions = {
    "remotePort": number
    "localPort": number
    "localIP"?: string
    "remoteIP"?: string
    "multiplex"?: {
        "reuse-connection"?: boolean
        "tag"?: string
        "controlpersist"?: number
        "x11"?: boolean
    }
}

export class SshShellCommand
{
    shell: ShellCommand
    resource: Resource = {"username": "", "address": ""}
    multiplex: boolean = true
    data_dir: string // directory where ssh master socket will be stored
    base_options: Required<SshShellOptions>  // multiplex and ssh options will inherit from these optioons
    tags = {tunnel: 'tunnel-'} // tags used for multiplex master socket when creating tunnel

    constructor(debug: boolean, silent: boolean, data_dir: string, base_options: Required<SshShellOptions> = {ssh: {}, multiplex: {}})
    {
      this.data_dir = data_dir
      this.shell = new ShellCommand(debug, silent)
      this.base_options = base_options
    }

    setResource(resource: Resource) : void
    {
      this.resource = resource
    }

    commandString(command: string, flags: Dictionary={}, args: Array<string>=[], options: SshShellOptions = {}) : string
    {
      const {ssh_flags, ssh_args} = this.sshFlagsAndArgs(command, flags, args, options)
      return this.shell.commandString('ssh', ssh_flags, ssh_args)
    }

    // set post_process format to trim by default
    output(command: string, flags: Dictionary={}, args: Array<string>=[], options: SshShellOptions = {}) : ValidatedOutput<string>
    {
      const {ssh_flags, ssh_args} = this.sshFlagsAndArgs(command, flags, args, options)
      return trim(this.shell.output('ssh', ssh_flags, ssh_args, options))
    }

    // set post_process format to trim by default
    exec(command: string, flags: Dictionary = {}, args: Array<string> = [], options: SshShellOptions = {}) : ValidatedOutput<SpawnSyncReturns<Buffer>>
    {
      const {ssh_flags, ssh_args} = this.sshFlagsAndArgs(command, flags, args, options)
      return this.shell.exec('ssh', ssh_flags, ssh_args, options)
    }

    private sshFlagsAndArgs(command: string, flags: Dictionary={}, args: Array<string>=[], options: SshShellOptions = {})
    {
      const ssh_options = { ... JSTools.rCopy(this.base_options.ssh), ... (options.ssh || {}) }
      const multiplex_options = { ... JSTools.rCopy(this.base_options.multiplex), ... (options.multiplex || {}) }

      const use_multiplex = (this.multiplex && this.multiplexExists(multiplex_options))
      const ssh_flags:Dictionary = {}
      if(ssh_options.interactive) {
        ssh_flags.t = {}
        ssh_flags.o = "LogLevel=QUIET"
      }
      if(ssh_options.x11)
        this.addSshX11Flags(ssh_flags)
      if(!use_multiplex && this.resource.key) // no resource needed if socket exists
        ssh_flags.i = {value: this.resource.key, noequals: true}
      if(use_multiplex)
        ssh_flags.S = {value: this.multiplexSocketPath(multiplex_options), noequals: true}
      const ssh_args = [`${this.resource.username}@${this.resource.address}`]
      if(command) ssh_args.push(this.shell.commandString(command, flags, args))
      return {ssh_flags: ssh_flags, ssh_args: ssh_args}
    }

    // === File Transfer Functions  ============================================

    scp(local_path: string, remote_path: string, direction: "push"|"pull", options: SshShellOptions = {}) : ValidatedOutput<SpawnSyncReturns<Buffer>>|ValidatedOutput<undefined>
    {
      if(!["push", "pull"].includes(direction)) return new ValidatedOutput(false, undefined, ['Internal Error: SshShellCommand.scp() was passed an invalid direction string']);
      const multiplex_options = { ... JSTools.rCopy(this.base_options.multiplex), ... (options.multiplex || {}) }
      const use_multiplex = (this.multiplex && this.multiplexExists(multiplex_options))
      // -- set flags ----------------------------------------------------------
      var flags:Dictionary = {r: {}, p: {}}
      if(!use_multiplex && this.resource.key) // no resource needed if socket exists
        flags.i = {value: this.resource.key, noequals: true}
      if(use_multiplex)
        flags.o = `ControlPath=${this.multiplexSocketPath(multiplex_options)}`
      // -- set args -----------------------------------------------------------
      const escaped_remote_path = `${this.resource.username}@${this.resource.address}:${ShellCommand.bashEscape(remote_path)}` // NOTE: remote arguments must be escaped twice, since they are resolved on host and on remote. Since shell-command already escapes arguments we only do it once here
      const args = (direction === "push") ?
        [local_path, escaped_remote_path] : //push
        [escaped_remote_path, local_path]   //pull
      return this.shell.exec("scp", flags, args, options)
    }

    rsync(local_path: string, remote_path: string, direction: "push"|"pull", flags: Dictionary, options: SshShellOptions = {}) : ValidatedOutput<SpawnSyncReturns<Buffer>>|ValidatedOutput<undefined>
    {
      if(!["push", "pull"].includes(direction)) return new ValidatedOutput(false, undefined, ['Internal Error: SshShellCommand.scp() was passed an invalid direction string']);
      const multiplex_options = { ... JSTools.rCopy(this.base_options.multiplex), ... (options.multiplex || {}) }
      const use_multiplex = (this.multiplex && this.multiplexExists(multiplex_options))
      // -- set flags ----------------------------------------------------------
      if(!use_multiplex && this.resource.key) // no resource needed if socket exists
        flags.e = `ssh -i "${this.resource.key}"`
      if(use_multiplex)
        flags.e = `ssh -o 'ControlPath=${this.multiplexSocketPath(multiplex_options)}'`
      // -- set args -----------------------------------------------------------
      const escaped_remote_path = `${this.resource.username}@${this.resource.address}:${ShellCommand.bashEscape(remote_path)}` // NOTE: remote arguments must be escaped twice, since they are resolved on host and on remote. Since shell-command already escapes arguments we only do it once here
      const args = (direction === "push") ?
        [local_path, escaped_remote_path] : //push
        [escaped_remote_path, local_path]   //pull
      return this.shell.exec("rsync", flags, args, options)
    }

    // === Multiplex Commands ==================================================

    multiplexStart(user_options:MultiplexOptions={}) : boolean // start the multiplex master
    {
      const options = { ... JSTools.rCopy(this.base_options.multiplex), ... (user_options || {}) }
      if(this.multiplexExists(options)) return true
      fs.ensureDirSync(path.dirname(this.multiplexSocketPath(options)))

      const command = "ssh"
      const ssh_options = ["ExitOnForwardFailure yes"]
      if(options.controlpersist) ssh_options.push(`ControlPersist ${options.controlpersist}s`)
      const flags:Dictionary = {
        M: {}, // set as master for multiplexer
        N: {}, // No command (does not execute anything over ssh)
        f: {}, // send to background
        o: {value: ssh_options, noequals: true},
        S: {value: this.multiplexSocketPath(options), noequals: true} // location of socket
      }
      if(options?.x11) this.addSshX11Flags(flags)
      if(this.resource.key) flags.i = {value: this.resource.key, noequals: true}
      const args = [`${this.resource.username}@${this.resource.address}`]
      const result = this.shell.exec(command, flags, args, {stdio: 'ignore'})
      return (result.success && this.multiplexExists(options))
    }

    multiplexStop(user_options:MultiplexOptions={}) : boolean // stop the multiplex master
    {
      const options = { ... JSTools.rCopy(this.base_options.multiplex), ... (user_options || {}) }
      if(!this.multiplexExists(options)) return true
      const command = 'ssh'
      const flags = {
        O: {value: 'stop', noequals: true}, // Control multiplex. Request stop
        S: {value: this.multiplexSocketPath(options), noequals: true} // location of socket
      }
      const args = [`${this.resource.username}@${this.resource.address}`]
      const result = this.shell.exec(command, flags, args, {stdio: 'ignore'})
      const success = (result.success && !this.multiplexExists(options))
      if(success) return true
      // -- manually remove socket --------------------------------------------- 
      fs.unlinkSync(this.multiplexSocketPath(options))
      return !this.multiplexExists(options)
    }

    multiplexAlive(user_options:MultiplexOptions={}) : boolean // check status of the multiplex master
    {
      const options = { ... JSTools.rCopy(this.base_options.multiplex), ... (user_options || {}) }
      if(!this.multiplexExists(options)) return false
      const command = 'ssh'
      const flags = {
        O: {value: 'check', noequals: true}, // Control multiplex. Request stop
        S: {value: this.multiplexSocketPath(options), noequals: true} // location of socket
      }
      const args = ['arg'] // add a dummy arg for command
      const result = this.shell.exec(command, flags, args, {stdio: 'ignore'})
      return result.success
    }

    multiplexExists(user_options:MultiplexOptions={}) : boolean // returns true if multiplex socket file exists
    {
        const options = { ... JSTools.rCopy(this.base_options.multiplex), ... (user_options || {}) }
        return fs.existsSync(this.multiplexSocketPath(options))
    }

    private multiplexSocketPath(user_options:MultiplexOptions={}) : string // returns name of multiplex socket
    {
      const options = { ... JSTools.rCopy(this.base_options.multiplex), ... (user_options || {}) }
      return path.join(this.data_dir, `${options?.tag || ""}${this.resource.username}@${this.resource.address}:22`)
    }

    private addSshX11Flags(flags: Dictionary, platform:string=os.platform())
    {
      if(platform === 'darwin') flags.Y = {}
      else if(platform === 'linux') flags.X = {}
    }

    // === Tunnel Functions ====================================================

    tunnelStart(options:SshTunnelOptions) : boolean
    {
      const default_remote_ip = '127.0.0.1'
      const multiplex_options = { 
          "tag": options.multiplex?.tag || this.tags.tunnel, 
          "controlpersist": options.multiplex?.controlpersist || 600,
          "x11": options.multiplex?.x11 || false
     }

      if(!options.multiplex?.["reuse-connection"] || !this.multiplexAlive(multiplex_options)) {
        if(!this.tunnelStop(multiplex_options)) return false // -- stop any existing tunnel
        if(!this.multiplexStart(multiplex_options)) return false
      }
      
      const command = 'ssh'
      const flags = {
        O: {value: 'forward', noequals: true},
        L: {value: `${(options.localIP) ? `${options.localIP}:` : ''}${options.localPort}:${options.remoteIP || default_remote_ip}:${options.remotePort}`, noequals: true},
        S: {value: this.multiplexSocketPath(multiplex_options), noequals: true}
      }

      const args = [`${this.resource.username}@${this.resource.address}`]
      const result = this.shell.exec(command, flags, args, {stdio: 'ignore'})
      if(!result.success) return false
      return this.multiplexExists(multiplex_options)
    }

    tunnelStop(user_options:MultiplexOptions={}) : boolean
    {
      const multiplex_options = { 
          ... {tag: this.tags.tunnel},
          ... user_options
      }
      return this.multiplexStop(multiplex_options)
    }

    tunnelRelease(options:SshTunnelOptions) : boolean
    {
        const default_remote_ip = '127.0.0.1'
        const multiplex_options = { 
            "tag": options.multiplex?.tag || this.tags.tunnel, 
            "controlpersist": options.multiplex?.controlpersist || 600,
            "x11": options.multiplex?.x11 || false
        }

        if( ! this.multiplexAlive(multiplex_options))
            return true
        
        const command = 'ssh'
        const flags = {
            O: {value: 'cancel', noequals: true},
            L: {value: `${(options.localIP) ? `${options.localIP}:` : ''}${options.localPort}:${options.remoteIP || default_remote_ip}:${options.remotePort}`, noequals: true},
            S: {value: this.multiplexSocketPath(multiplex_options), noequals: true}
        }
        const args = [`${this.resource.username}@${this.resource.address}`]        
        return this.shell.exec(command, flags, args, {stdio: 'ignore'}).success
    }

}