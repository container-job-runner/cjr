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

import {spawn, spawnSync} from 'child_process'
import {quote} from 'shell-quote'
import {ValidatedOutput} from './validated-output'
type Dictionary = {[key: string]: any}

export class ShellCMD
{
    _explicit: boolean; // if true then
    _silent: boolean; // if true then no output will be shown and std_out will not be attached
    _DEBUG: boolean = false

    constructor(explicit: boolean, silent: boolean)
    {
      this._explicit = explicit;
      this._silent = silent;
    }

    // Launches a syncronous command. Defaults to in a shell, which either stdio inherit or ignore

    sync(command: string, flags: object, args: Array<string>, options: Dictionary = {})
    {
      var default_options = {stdio : 'inherit', shell: '/bin/bash'}
      options = {... default_options, ...options};
      if(this._silent && !options?.["ignore-silent"]) options.stdio = 'ignore';
      this.printCMD(command, flags, args, true, options);
      return spawnSync(this.cmdString(command, flags, args), [], options)
    }

    // Launches a syncronous command in a shell and returns output string

    output(command: string, flags: object, args: Array<string>, options:Dictionary = {}, format="")
    {
      var default_options = {stdio : 'pipe', shell: '/bin/bash', encoding: 'buffer'}
      options = {... default_options, ...options};
      this.printCMD(command, flags, args, true, options);
      var child_process = spawnSync(this.cmdString(command, flags, args), [], options)
      var result = new ValidatedOutput(true);

      if(child_process.status == 0) {
        result.data = child_process?.stdout?.toString('ascii')
      }
      else if(child_process.status != 0) {
        result.pushError(child_process?.stderr?.toString('ascii'))
      }

      if(result.success && format === "json")
      {
        try
        {
          result.data = JSON.parse(result.data);
        }
        catch(e)
        {
          result.success = false;
          result.data = [];
        }
      }
      else if(result.success && format === "line_json")
      {
        try
        {
          result.data = result.data.split("\n").filter((e:string) => e !== "").map((e:string) => JSON.parse(e));
        }
        catch(e)
        {
          result.success = false;
          result.data = [];
        }
      }
      else if(result.success && format === "trim")
      {
        result.data = result.data.trim()
      }


      return result;
    }

    async(command: string, flags: Dictionary, args: Array<string>, options: Dictionary = {})
    {
      var default_options = {stdio : 'ignore'}
      options = {... default_options, ...options};
      if(this._silent) options.stdio = 'ignore';
      this.printCMD(command, flags, args, false, options);
    }

    cmdString(command: string, flags: Dictionary, args: Array<string>)
    {
      const arrayWrap = (x:any) => (x instanceof Array) ? x : [x]
      const flagString = function(value:string, flag:string, shorthand:boolean, sanitize_flag:boolean, noequals_flag:boolean) // produces string for command flag with value
      {
        const v_str = (value !== undefined) ? `${(noequals_flag) ? ' ' : '='}${(sanitize_flag) ? quote([value]) : value}` : ""
        return (shorthand) ? ` -${flag}${v_str}` : ` --${flag}${v_str}`;
      }

      var cmdstr = command
      for(let key in flags) {
        let props = flags[key]
        let str_arr = arrayWrap(props.value).map(
          v => flagString(v, key, props?.shorthand, ('sanitize' in props) ? props.sanitize : true, props?.noequals || false))
        cmdstr += str_arr.join(" ")
      }
      return cmdstr + " " + args.join(" ");
    }

    private printCMD(command: string, flags: Dictionary, args: Array<string>, sync: boolean, options: object)
    {
      if(this._explicit && !this._silent)
      {
        if(this._DEBUG)
        {
          var header = (sync) ?
          "=".repeat(38) + " SYNC " + "=".repeat(38) :
          "=".repeat(37) + " A-SYNC " + "=".repeat(37);

          console.log(header)
          console.log("command:\n\t" + command)
          console.log("flags:")
          for (let key in flags) {
            var value = ('value' in flags[key]) ? "=" + flags[key].value : "";
            console.log("\t" + key + value)
          }
          console.log("args:")
          args.forEach(a => console.log("\t" + a))
          console.log("command string:")
          console.log("\t" + this.cmdString(command, flags, args))
          console.log("options:", options)
          console.log("=".repeat(36) + " Output " + "=".repeat(36))
          }
        else
        {
          console.log(" " + this.cmdString(command, flags, args))
        }
      }
    }
}
