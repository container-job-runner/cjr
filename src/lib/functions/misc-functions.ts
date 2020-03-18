import * as chalk from 'chalk'
import * as os from 'os'

import {ValidatedOutput} from '../validated-output'
import {ErrorStrings} from '../error-strings'
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

// Extract jupyter url from container, sets value to variable JURL and runs command
export async function startJupyterApp(runner: RunDriver, shell: ShellCommand, jupyter_id: string, app_path: string)
{
  // -- get output from jupyter ----------------------------------------------
  const result = runner.jobExec(jupyter_id, ['jupyter', 'notebook', 'list'], {}, 'output')
  if(!result.success) return result
  const raw_output = (result.data as string).trim().split("\n").pop() // get last non-empty line of output
  if(!raw_output) return new ValidatedOutput(false)
  // -- extract url ----------------------------------------------------------
  const re = /http:\/\/\d+\.\d+\.\d+\.\d+\S*/ // matches http://X.X.X.X
  if(!re.test(result.data)) return new ValidatedOutput(false)
  const url = raw_output.match(re)?.[0] || ""
  if(!url) return new ValidatedOutput(false)
  // -- start app ------------------------------------------------------------
  const platform = os.platform()
  var command: string = ""
  if(platform == "darwin")
  {
    command = `export JURL=${ShellCommand.bashEscape(url)} && open ${app_path}`
  }
  else
  {
    command = `export JURL=${ShellCommand.bashEscape(url)} && ${app_path}`
  }
  return shell.execAsync(command)
}

// start jupyter after time delay and retry if unsuccessful
export async function slowstartJupyterApp(runner: RunDriver, shell: ShellCommand, jupyter_id: string, app_path: string, max_tries:number=5, timeout:number = 2000)
{
  var result = new ValidatedOutput(false)
  for(var i = 0; i < max_tries; i ++) {
    await JSTools.sleep(timeout)
    var result = await startJupyterApp(runner, shell, jupyter_id, app_path)
    if(result.success) break
  }
  return result
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
