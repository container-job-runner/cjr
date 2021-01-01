import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import { ValidatedOutput } from '../validated-output'
import { ShellCommand } from '../shell-command'
import { trim } from '../functions/misc-functions'
import { PathTools } from './path-tools'
import { SshShellCommand } from '../ssh-shell-command'

export class FileTools
{

  static existsDir(path_str: string) // determines if directory exists
  {
    if(!path_str) return false
    return fs.existsSync(path_str) && fs.lstatSync(path_str).isDirectory()
  }

  static existsFile(path_str: string) // determines if file exists
  {
    if(!path_str) return false
    return fs.existsSync(path_str) && fs.lstatSync(path_str).isFile()
  }

  // creates a temporary directory inside parent_abs_path
  static mktempDir(parent_abs_path: string, shell:ShellCommand|SshShellCommand = new ShellCommand(false, false))
  {
    fs.ensureDirSync(parent_abs_path)
    switch(os.platform())
    {
      case "darwin":
        return trim(shell.output('mktemp', {d: {}}, [path.join(parent_abs_path, "tmp.XXXXXXXXXX")], {}))
      case "linux":
        const flags = {
          tmpdir: parent_abs_path,
          directory: {}
        }
        return trim(shell.output('mktemp', flags, [], {}))
      default: // not thread safe
        const tmp_file_path = fs.mkdtempSync(PathTools.addTrailingSeparator(parent_abs_path)) // ensure trailing separator on path
        return new ValidatedOutput(true, tmp_file_path)
    }
  }

  // This function uses lsof to obtain a list
  static usedPorts(starting_port: number, shell:ShellCommand|SshShellCommand = new ShellCommand(false, false), timeout:number=0) : number[]
  {
    starting_port = Math.max(0, Math.ceil(starting_port))
    const command = 'lsof'
    const flags = {
        "i": {value: `:${starting_port}-65535`, noequals: true}, // specify port range
        "n": {}, // inhibits the conversion of network numbers to host names
        "P": {}, // inhibits the conversion of port numbers to port names
        "F": {value: 'n', noequals: true}  // produces output that is suitable for processing by another program
    }
    const output = shell.output(command, flags, [], {"timeout": timeout})
    if( ! output.success ) return []
    
    const row_splitter = /[\r\n]+/
    const n_lines = output.value.split(row_splitter).filter((s:string) => /^n/.test(s)) // extract lines that start with n
    
    const extractPort = (s:string) => s.match(/(?<=:)\d+$/)?.pop() || ""
    // return all valid ports
    return n_lines.map( (s:string) => parseInt(extractPort(s))).filter( ( n:number ) => ( ! isNaN(n) && isFinite(n) && n > 0 ) )
  }


  // sshConnections uses lsof to look for all active ssh connections and any tunnels that connect 127.0.0.1 with a remote host

  static sshConnections(shell:ShellCommand|SshShellCommand = new ShellCommand(false, false), timeout:number=0) : { [ key: string] : number[]}
  {
    const command = 'lsof'
    const flags = {
        "i": {value: `TCP`, noequals: true}, // look only at TCP connections
        "n": {}, // inhibits the conversion of network numbers to host names
        "P": {}, // inhibits the conversion of port numbers to port names
        "F": {value: 'pcn', noequals: true}  // print process, command, name
    }
    const output = shell.output(command, flags, [], {"timeout": timeout})
    if( ! output.success ) return {}
    
    const row_splitter = /[\r\n]+/
    const lines = output.value.split(row_splitter) // extract lines that start with n

    // -- parse output ---------------------------------------------------------
    let pid:string|undefined = undefined
    let cmd:string|undefined = undefined
    let address:string|undefined = undefined
    let port:number|undefined = undefined

    const pid_regex = /(?<=^p)\d+/
    const cmd_regex = /(?<=^c)\S+/
    const address_regex = /(?<=n\S+->)\d+\.\d+\.\d+\.\d+(?=:\d+)/
    const port_regex = /(?<=n127.0.0.1:)\d+/

    const connections: { [key: string] : {address: string, "local-tunnel-ports": number[]}} = {}
    for( let i = 0; i <= lines.length; i ++) // assumes pid and command preceed name
    {
        const line = lines[i]
        if( pid_regex.test(line) )
            pid = pid_regex.exec(line)?.pop() || pid
        else if ( cmd_regex.test(line) ) 
            cmd = cmd_regex.exec(line)?.pop() || cmd
        else if ( pid && cmd === "ssh" ) 
        {
            if(connections[pid] === undefined)
                connections[pid] = { address: "", "local-tunnel-ports": []}

            port = parseInt(port_regex?.exec(line)?.pop() || "") || undefined
            if( port ) connections[pid]["local-tunnel-ports"].push(port)

            address = address_regex.exec(line)?.pop() || undefined
            if( address ) connections[pid].address = address
        }
    }

    // -- process outputs -----------------------------------------------------
    const result:{ [ key: string] : number[]} = {}  
    Object.keys(connections).map((s:string) => {
        const address = connections[s].address
        result[address] = (result?.[address] || []).concat(connections[s]["local-tunnel-ports"])
    })
    return result
  }

}
