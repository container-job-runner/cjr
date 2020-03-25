import * as chalk from 'chalk'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as inquirer from 'inquirer'

import {ValidatedOutput} from '../validated-output'
import {ErrorStrings, WarningStrings} from '../error-strings'
import {JSTools} from '../js-tools'
import {ShellCommand} from '../shell-command'
import {RunDriver} from '../drivers/abstract/run-driver'

type Dictionary = {[key: string]: any}

export function ajvValidatorToValidatedOutput(ajv_validator: any, raw_object:Dictionary)
{
  return (ajv_validator(raw_object)) ? new ValidatedOutput(true, raw_object) :
    new ValidatedOutput(false, undefined,
      [ErrorStrings.YML.INVALID(ajv_validator.errors.map( (x:any) => x.message).join("\n"))]
    )
}

export function printResultState(result: ValidatedOutput)
{
  result.warning.forEach( (e:string) => console.log(chalk`{bold.yellow WARNING}: ${e}`))
  result.error.forEach( (e:string) => console.log(chalk`{bold.red ERROR}: ${e}`))
}

// -----------------------------------------------------------------------------
// XPrepate: ensures any x11 is ready to run. Only affects mac
// ensures xquartz is running
// ensures network connections are set
// -- Parameters ---------------------------------------------------------------
// -----------------------------------------------------------------------------
export async function initX11(interactive: boolean, explicit: boolean)
{
  const platform = os.platform()
  const shell = new ShellCommand(explicit, false)

  if(platform == "darwin") // -- OSX -------------------------------------------
  {
    // 1. check if x11 settings plist file exists
    const x11_config_path = path.join(os.homedir(), 'Library/Preferences/org.macosforge.xquartz.X11.plist')
    if(!fs.existsSync(x11_config_path)) return new ValidatedOutput(false)
    var result = shell.output(`plutil -extract nolisten_tcp xml1 -o - ${x11_config_path}`) // note extract as xml1 instead of json since json exits in error
    if(!result.success) return new ValidatedOutput(false)
    var response: { flag: any; } & { flag: any; } = {flag: false}
    if((new RegExp('<true/>')).test(result.data))
    {
      if(interactive) {
        printResultState(new ValidatedOutput(true).pushWarning(WarningStrings.X11.XQUARTZ_NOREMOTECONNECTION))
        var response = await inquirer.prompt([
          {
            name: "flag",
            message: `Should cjr automatically change this setting?`,
            type: "confirm",
          }
        ])
        if(!response.flag) return new ValidatedOutput(false)
      }
      // change setting
      if(!interactive || response?.flag == true)
        shell.output(`plutil -replace nolisten_tcp -bool NO ${x11_config_path}`)
    }
    // 2. start x11 if it's not already running
    var result = shell.output('xset', {q: {}})
    if(!result.success) return new ValidatedOutput(false)
  }

  return new ValidatedOutput(true)
}

// -----------------------------------------------------------------------------
// PRINTTABLE: prints a formatted table_parameters with title, header.
// -- Parameters ---------------------------------------------------------------
// configuration (Object) with fields:
//    column_widths    (nx1 Array<number>)   - width of each column (in spaces)
//    text_widths      (nx1 Array<string>)   - max width of text for each column. must satisfy text_widths[i] <= column_widths[i]
//    silent_clip      (nx1 Array<boolean>)  - if silent_clip[i] == false, then any shortened text will end with "..."
//    title            (String)              - title of table
//    header:          (nx1 Array<string>)   - name of each column
// -----------------------------------------------------------------------------
export function printVerticalTable(configuration: Dictionary)
{

  // -- read data into local variables for convenience -------------------------
  const c_widths = configuration.column_widths
  const t_widths = configuration.text_widths
  const s_clip   = configuration.silent_clip
  const title    = configuration.title
  const c_header = configuration.column_headers

  // -- helper function for printing a table row -------------------------------
  const printRow = (row: Array<string>) => {
    console.log(
      row.map(
        (s:string, index:number) => JSTools.clipAndPad(s, t_widths[index], c_widths[index], s_clip[index])
      ).join("")
    )
  }

  // -- print title ------------------------------------------------------------
  if(title) {
    const width = c_widths.reduce((total:number, current:number) => total + current, 0)
    console.log(chalk`-- {bold ${title}} ${"-".repeat(width - title.length - 4)}`)
  }
  // -- print header -----------------------------------------------------------
  if(c_header) printRow(c_header)
  // -- print data -------------------------------------------------------------
  configuration.data.map((row: Array<string>) => printRow(row))
}

export function printHorizontalTable(configuration: Dictionary)
{

  // -- read data into local variables for convenience -------------------------
  const c_widths  = configuration.column_widths // should be of length 2
  const t_widths  = configuration.text_widths   // should be of length 2
  const title     = configuration.title
  const r_headers = configuration.row_headers

  // -- helper function for printing a table row -------------------------------
  const printItem = (row: Array<string>, data_index: number) => {
    for(var header_index = 0; header_index < row.length; header_index ++) {
      const content:Array<string> = JSTools.lineSplit(row[header_index], t_widths[1]) // split data into lines
        content.map((line:string, line_index:number) => {
          const header = (line_index == 0) ? r_headers[header_index] : "" // header only prints on first line
          console.log( // print header + data
            JSTools.clipAndPad(header, t_widths[0], c_widths[0], true) +
            JSTools.clipAndPad(line, t_widths[1], c_widths[1], true)
          )
        })
      }
      if(data_index != configuration.data.length - 1) console.log()
  }

  // -- print title ------------------------------------------------------------
  if(title) {
    const width = c_widths.reduce((total:number, current:number) => total + current, 0)
    console.log(chalk`-- {bold ${title}} ${"-".repeat(width - title.length - 4)}`)
  }
  // -- print data -------------------------------------------------------------
  configuration.data.map((item: Array<string>, index: number) => printItem(item, index))
}
