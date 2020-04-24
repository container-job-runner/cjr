import * as chalk from 'chalk'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as inquirer from 'inquirer'

import { ValidatedOutput } from '../validated-output'
import { ErrorStrings, WarningStrings } from '../error-strings'
import { JSTools } from '../js-tools'
import { ShellCommand } from '../shell-command'
import { RunDriver } from '../drivers/abstract/run-driver'
import { outputFile } from 'fs-extra'

type Dictionary = {[key: string]: any}

export function ajvValidatorToValidatedOutput(ajv_validator: any, raw_object:Dictionary) : ValidatedOutput<undefined>
{
  return (ajv_validator(raw_object)) ? new ValidatedOutput(true, undefined) :
    new ValidatedOutput(false, undefined).pushError(
      ErrorStrings.YML.INVALID(ajv_validator.errors.map( (x:any) => x.message).join("\n"))
    )
}

export function printResultState(result: ValidatedOutput<any>)
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
export async function initX11(interactive: boolean, explicit: boolean) : Promise<ValidatedOutput<undefined>>
{
  const platform = os.platform()
  const shell = new ShellCommand(explicit, false)

  if(platform == "darwin") // -- OSX -------------------------------------------
  {
    // 1. check if x11 settings plist file exists
    const x11_config_path = path.join(os.homedir(), 'Library/Preferences/org.macosforge.xquartz.X11.plist')
    if(!fs.existsSync(x11_config_path)) return new ValidatedOutput(false, undefined)
    var result = shell.output(`plutil -extract nolisten_tcp xml1 -o - ${x11_config_path}`) // note extract as xml1 instead of json since json exits in error
    if(!result.success) return new ValidatedOutput(false, undefined)
    var response: { flag: any; } & { flag: any; } = {flag: false}
    if((new RegExp('<true/>')).test(result.value))
    {
      if(interactive) {
        printResultState(new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.XQUARTZ_NOREMOTECONNECTION))
        var response = await inquirer.prompt([
          {
            name: "flag",
            message: `Should cjr automatically change this setting?`,
            type: "confirm",
          }
        ])
        if(!response.flag) return new ValidatedOutput(false, undefined)
      }
      // change setting
      if(!interactive || response?.flag == true)
        shell.output(`plutil -replace nolisten_tcp -bool NO ${x11_config_path}`)
    }
    // 2. start x11 if it's not already running
    var result = shell.output('xset', {q: {}})
    if(!result.success) return new ValidatedOutput(false, undefined)
  }

  return new ValidatedOutput(true, undefined)
}

 // checks if ValidatedOutput contains valid json and returns parsed json data or returns failed result
export function parseJSON(output:ValidatedOutput<string>) : ValidatedOutput<any>
{
  const parsed_output = new ValidatedOutput<any>(true, undefined).absorb(output);
  if(!parsed_output.success) return parsed_output
  try
  {
    parsed_output.value = JSON.parse(output.value)
  }
  catch(e)
  {
    return parsed_output.pushError(
      chalk`{bold Invalid JSON} - shell output did not contain valid JSON.`
    )
  }
  return parsed_output
}

// checks if each line of the output is json and returns an array of json data or returns failed result
export function parseLineJSON(output:ValidatedOutput<string>) : ValidatedOutput<Array<any>>
{
  const parsed_output = new ValidatedOutput<Array<any>>(true, []).absorb(output);
  if(!parsed_output.success) return parsed_output
  try
  {
    parsed_output.value = output.value.split("\n")
      .filter((e:string) => e !== "") // remove empty strings
      .map((e:string) => JSON.parse(e)) // parse each line
  }
  catch(e)
  {
    return parsed_output.pushError(
      chalk`{bold INVALID LINE JSON} - shell output did not contain valid Line JSON.`
    )
  }
  return parsed_output
}

// trims any whitespace from output
export function trim(output:ValidatedOutput<string>) : ValidatedOutput<string>
{
  const trimmed_output = new ValidatedOutput<string>(true, "").absorb(output);
  if(!trimmed_output.success) return trimmed_output
  trimmed_output.value = output.value.trim()
  return trimmed_output
}

// trims any whitespace from command output output
export function trimTrailingNewline(output:ValidatedOutput<string>) : ValidatedOutput<string>
{
  const trimmed_output = new ValidatedOutput<string>(true, "").absorb(output);
  if(!trimmed_output.success) return trimmed_output
  trimmed_output.value = output.value.replace(/\r\n$/, "")
  return trimmed_output
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
  configuration.value.map((row: Array<string>) => printRow(row))
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
      if(data_index != configuration.value.length - 1) console.log()
  }

  // -- print title ------------------------------------------------------------
  if(title) {
    const width = c_widths.reduce((total:number, current:number) => total + current, 0)
    console.log(chalk`-- {bold ${title}} ${"-".repeat(width - title.length - 4)}`)
  }
  // -- print data -------------------------------------------------------------
  configuration.value.map((item: Array<string>, index: number) => printItem(item, index))
}
