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
        "F": {value: 'nT', noequals: true}  // produces output that is suitable for processing by another program (n adds internet address, T shows TCP connection info)
    }
    const output = shell.output(command, flags, [], {"timeout": timeout})
    if( ! output.success ) return []
    
    const row_splitter = /[\r\n]+/
    const lines = output.value.split(row_splitter)
    const ports = []

    const pid_regex = /(?<=^p)\d+/
    const port_regex = /^n/
    const tst_regex = /^TST=(LISTEN|ESTABLISHED)/
    const extractPort = (s: string) => {
        const n = parseInt(
            s.match(/(?<=:)\d+(?=->)/)?.pop() || // if forwarded connections take host port
            s.match(/(?<=:)\d+$/)?.pop() || // if direct connections take port at end of string
            "") 
        if(! isNaN(n) && isFinite(n) && n > 0)
            return n
        return undefined
    }

    let valid_tst: boolean = false
    let port:number|undefined = undefined
    
    for( let i = 0; i <= lines.length; i ++) // assume that pid preceeds all other data fields
    {
        const line = lines[i]
        
        if( pid_regex.test(line) ) 
        {
            if( valid_tst && port !== undefined)
                ports.push(port)
                
            // reset values for each new pid
            valid_tst = false;
            port = undefined
        }
        else if ( tst_regex.test(line) ) 
            valid_tst = true
        else if ( port_regex.test(line) ) 
            port = extractPort(line)
    }

    if( valid_tst && port !== undefined)
        ports.push(port)

    return [ ... new Set(ports) ]
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
