// =============================================================================
// ShellCommand: A class for launching sync and async shell commands
//  -- Functions ---------------------------------------------------------------
//  exec - executes a sync command with stdio set to 'inherit'.
//  execSync - async version of exec
//  output - executes sync command with stdio set to 'pipe' and returns output
//  commandString - returns a command string for command, flags, and args array
//  bashEscape - escapes string for bash
//  -- Example -----------------------------------------------------------------
// shell.exec('echo', {}, ['$PATH']) // echo '$PATH' (escapes $PATH)
// shell.exec('ls', {l:{}}, []) // ls -l
// shell.exec('command', {flag: {value: 'val', escape: false}}) // command --flag=val
// shell.exec('command', {flag: ['val']}) // command --flag='val'
// shell.exec('command', {flag: ['val1','val2']}) // command --flag='val1' --flag='val2'
// shell.exec('command', {flag: {value: 'val1', noequals: true}})  // command --flag 'val1'
// =============================================================================

import { spawn, spawnSync, SpawnSyncReturns, ChildProcess } from 'child_process'
import { ValidatedOutput } from './validated-output'
import { JSTools } from './js-tools'
type Dictionary = {[key: string]: any}

export class ShellCommand
{
    debug: boolean // if true then commands are printed before execution
    silent: boolean   // if true then no output will be shown and std_out will not be attached
    escape_args: boolean  = true
    escape_flags: boolean = true

    private spawn_options = ['cwd', 'input', 'argv0', 'stdio', 'env', 'uid', 'gid', 'timeout', 'killSignal', 'maxBuffer', 'encoding', 'shell']

    constructor(debug: boolean, silent: boolean)
    {
      this.debug = debug;
      this.silent = silent;
    }

    // Sync command with stdio set to 'inherit' or 'ignore'. Returns ValidatedOutput containing child process
    exec(command: string, flags: Dictionary = {}, args: Array<string> = [], options: Dictionary = {}): ValidatedOutput<SpawnSyncReturns<Buffer>>
    {
      const command_string = this.commandString(command, flags, args)
      const default_options:Dictionary = {stdio : 'inherit', shell: '/bin/bash'}
      const spawn_options = JSTools.oSubset({ ... default_options, ... options }, this.spawn_options)

      if(this.silent && spawn_options['stdio'] == 'inherit' && !options?.["ignore-silent"]) 
        options.stdio = 'ignore';
      this.printCommand(command_string)

      const child_process = spawnSync(command_string, [], spawn_options)
      const result = new ValidatedOutput(true, child_process)
      if(child_process?.status !== 0) { // -- check if exit-code is non zero
        result.pushError(child_process?.stderr?.toString('ascii'))
      }
      return result
    }

    // Async request with stdio set to 'inherit' or 'ignore'. Returns ValidatedOutput containing child process
    execAsync(command: string, flags: Dictionary = {}, args: Array<string> = [], options: Dictionary = {}) : ValidatedOutput<ChildProcess>
    {
      const command_string = this.commandString(command, flags, args)
      const default_options:Dictionary = {stdio : 'pipe', shell: '/bin/bash'}
      const spawn_options = JSTools.oSubset({ ... default_options, ... options }, this.spawn_options)

      if(this.silent && spawn_options['stdio'] == 'inherit' && !options?.["ignore-silent"])
        options.stdio = 'ignore';
      this.printCommand(command_string)

      return new ValidatedOutput(
        true,
        spawn(command_string, [], spawn_options)
      )
    }

    // Launches a syncronous command in a shell and returns output
    output(command: string, flags: Dictionary={}, args: Array<string>=[], options:Dictionary = {}) : ValidatedOutput<string>//|ValidatedOutput<Array<string>>
    {
      const result = this.exec(command, flags, args, {...options, ...{stdio : 'pipe', "ignore-silent": true, encoding: 'buffer', shell: '/bin/bash'}})
      if(!result.success) return new ValidatedOutput(false, "")
      return new ValidatedOutput(true, ShellCommand.stdout(result.value))
    }

    commandString(command: string, flags: Dictionary = {}, args: Array<string> = []) : string
    {
      // HELPER: wraps variable in array
      const arrayWrap = (x:any) => (JSTools.isArray(x)) ? x : [x]
      // HELPER: produces string for command flag with value
      const flagString = function(value:string, flag:string, shorthand:boolean, escape_flag:boolean, noequals_flag:boolean)
      {
        const v_str = (value !== undefined) ? `${(noequals_flag) ? ' ' : '='}${(escape_flag) ? ShellCommand.bashEscape(value) : value}` : ""
        return (shorthand) ? ` -${flag}${v_str}` : ` --${flag}${v_str}`;
      }

      let shorthand: boolean, escape: boolean, props: any, flag_arr: Array<string>, value: string
      let cmdstr = command
      for(var key in flags) {
        props = flags[key]
        shorthand = (props?.hasOwnProperty('shorthand')) ? props.shorthand : (key.length == 1) // by default intepret keys with one letter as shorthand
        escape    = (props?.hasOwnProperty('escape')) ? props.escape : this.escape_flags
        value     = ""
        if(JSTools.isString(props) || JSTools.isArray(props)) value = props
        else if(JSTools.isObject(props)) value = props.value
        flag_arr  = arrayWrap(value).map((v:string) => flagString(v, key, shorthand, escape, props?.noequals || false))
        cmdstr   += flag_arr.join("")
      }
      return `${cmdstr} ${(this.escape_args) ? ShellCommand.bashEscapeArgs(args).join(" ") : args.join(" ")}`;
    }

    // == Console Log Functions ================================================

    private printCommand(command: string) : void
    {
      if(this.debug && !this.silent)
        console.log(` ${command}`)
    }

    // == Bash Escape Functions ================================================

    // turns argv array into a properly escaped command string
    static bashEscapeArgs(argv: Array<string>) : Array<string>
    {
      return argv.map((a:string) => this.bashEscape(a))
    }

    // wraps a string in single quotes for bash, multiple times:
    // Based on shell-escape (https://www.npmjs.com/package/shell-escape)
    static bashEscape(value: string, iterations: number = 1) : string
    {
      for(var i = 0; i < iterations; i ++) {
        value = `'${value.replace(/'/g, "'\\''")}'`
          .replace(/^(?:'')+/g, '')   // unduplicate single-quote at the beginning
          .replace(/\\'''/g, "\\'" ); // remove non-escaped single-quote if there are enclosed between 2 escaped
      }
      return value;
    }

    // == Helper functions for extracting properties from exec output

    static stdout(child_process: SpawnSyncReturns<Buffer>) : string
    {
      return child_process?.stdout?.toString('ascii') || ""
    }

    static stderror(child_process: SpawnSyncReturns<Buffer>) : string
    {
      return child_process?.stderr?.toString('ascii') || ""
    }

    static status(child_process: SpawnSyncReturns<Buffer>) : number
    {
      return child_process?.status || -1
    }

    // == Helper functions for flags

    static removeEmptyFlags(flags: Dictionary)
    {
      Object.keys(flags).map((key:string) => {
        if(flags[key] === undefined || flags[key] === "")
          delete flags[key]
        else if(flags[key]?.value === "")
          delete flags[key]
      })
      return flags
    }

}
