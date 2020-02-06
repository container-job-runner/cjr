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

import * as chalk from 'chalk'
import {spawn, spawnSync} from 'child_process'
import {ValidatedOutput} from './validated-output'
import {JSTools} from './js-tools'
type Dictionary = {[key: string]: any}

export class ShellCommand
{
    _explicit: boolean // if true then commands are printed before execution
    _silent: boolean   // if true then no output will be shown and std_out will not be attached
    _escape_args: boolean  = true
    _escape_flags: boolean = true

    ErrorStrings = {
      INVALID_JSON: chalk`{bold Invalid JSON} - shell output did not contain valid JSON.`,
      INVALID_LINEJSON: chalk`{bold INVALID LINE JSON} - shell output did not contain valid Line JSON.`
    }

    constructor(explicit: boolean, silent: boolean)
    {
      this._explicit = explicit;
      this._silent = silent;
    }

    // Launches a syncronous command. Defaults to in a shell, which either stdio inherit

    exec(command: string, flags: Dictionary={}, args: Array<string>=[], options: Dictionary = {})
    {
      const command_string = this.commandString(command, flags, args)
      const default_options:Dictionary = {stdio : 'inherit', shell: '/bin/bash'}
      if(this._silent && !options?.["ignore-silent"]) options.stdio = 'ignore';
      this.printCommand(command_string)
      return spawnSync(command_string, [], {... default_options, ...options})
    }

    // Launches a syncronous command in a shell and returns output string

    output(command: string, flags: object, args: Array<string>, options:Dictionary = {}, post_process="")
    {
      var child_process = this.exec(command, flags, args, {...options, ...{stdio : 'pipe', encoding: 'buffer'}})

      // -- exit with failure if exit-code is non zero -------------------------
      if(child_process.status != 0) {
        const stderr_str = child_process?.stderr?.toString('ascii')
        return new ValidatedOutput(false, child_process, [stderr_str])
      }

      // process stdout --------------------------------------------------------
      const stdout_str = child_process?.stdout?.toString('ascii')
      var result = new ValidatedOutput(true, stdout_str);
      switch(post_process)
      {
        case 'json':
          result = this.parseJSON(result)
          break
        case 'line_json':
          result = this.parseLineJSON(result)
          break
        case 'trim':
          result = this.trimOutput(result)
          break
        default:
      }
      return result;
    }

    commandString(command: string, flags: Dictionary, args: Array<string>)
    {
      // HELPER: wraps variable in array
      const arrayWrap = (x:any) => (JSTools.isArray(x)) ? x : [x]
      // HELPER: produces string for command flag with value
      const flagString = function(value:string, flag:string, shorthand:boolean, escape_flag:boolean, noequals_flag:boolean)
      {
        const v_str = (value !== undefined) ? `${(noequals_flag) ? ' ' : '='}${(escape_flag) ? ShellCommand.bashEscape(value) : value}` : ""
        return (shorthand) ? ` -${flag}${v_str}` : ` --${flag}${v_str}`;
      }

      let shorthand: boolean, escape: boolean, props: Dictionary, flag_arr: Array<string>, value: string
      let cmdstr = command
      for(var key in flags) {
        props = flags[key]
        shorthand = (props?.hasOwnProperty('shorthand')) ? props.shorthand : (key.length == 1) // by default intepret keys with one letter as shorthand
        escape    = (props?.hasOwnProperty('escape')) ? props.escape : this._escape_flags
        if(JSTools.isString(props) || JSTools.isArray(props)) value = props
        else if(JSTools.isObject(props)) value = props.value
        flag_arr  = arrayWrap(value).map((v:string) => flagString(v, key, shorthand, escape, props?.noequals || false))
        cmdstr   += flag_arr.join(" ")
      }
      return `${cmdstr} ${(this._escape_args) ? ShellCommand.bashEscapeArgs(args).join(" ") : args.join(" ")}`;
    }

    // == Start Output PostProcess Functions ===================================

    // checks if output is json and returns json data or returns failed result
    private parseJSON(result:ValidatedOutput)
    {
      if(!result.success) return result
      try
      {
        return new ValidatedOutput(true, JSON.parse(result.data))
      }
      catch(e)
      {
        return new ValidatedOutput(false, [], [this.ErrorStrings.INVALID_JSON])
      }
    }

    // checks if each line of the output is json and returns an array of json data or returns failed result
    private parseLineJSON(result:ValidatedOutput)
    {
      if(!result.success) return result
      try
      {
        return new ValidatedOutput(true, result.data.split("\n")
          .filter((e:string) => e !== "") // remove empty strings
          .map((e:string) => JSON.parse(e)) // parse each line
        )
      }
      catch(e)
      {
        return new ValidatedOutput(false, [], [this.ErrorStrings.INVALID_LINEJSON])
      }
    }

    // trims any whitespace from output
    private trimOutput(result:ValidatedOutput)
    {
      if(!result.success) return result
      return new ValidatedOutput(true, result.data.trim())
    }

    // == Console Log Functions ================================================

    private printCommand(command: string)
    {
      if(this._explicit && !this._silent)
        console.log(` ${command}`)
    }

    // == Bash Escape Functions ================================================

    // turns argv array into a properly escaped command string
    static bashEscapeArgs(argv: Array<string>)
    {
      return argv.map((a:string) => this.bashEscape(a))
    }

    // wraps a string in single quotes for bash, multiple times:
    // Based on shell-escape (https://www.npmjs.com/package/shell-escape)
    static bashEscape(value: string, iterations: number = 1)
    {
      for(var i = 0; i < iterations; i ++) {
        value = `'${value.replace(/'/g, "'\\''")}'`
          .replace(/^(?:'')+/g, '')   // unduplicate single-quote at the beginning
          .replace(/\\'''/g, "\\'" ); // remove non-escaped single-quote if there are enclosed between 2 escaped
      }
      return value;
    }
}
