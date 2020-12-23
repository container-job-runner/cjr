import chalk = require('chalk')
import { ValidatedOutput } from '../validated-output'
import { ErrorStrings } from '../error-strings'
import { JSTools } from '../js-tools'
import { Dictionary } from '../constants'
import { URL } from 'url'
import { JobManager } from '../job-managers/abstract/job-manager'
import { SyncthingLocalService } from '../services/syncthing-local-service'
import { SyncthingRemoteService } from '../services/syncthing-remote-service'
import { MultiServiceManager } from '../services/managers/multi-service-manager'
import { GenericAbstractService } from '../services/abstract/generic-abstract-service'

export function ajvValidatorToValidatedOutput(ajv_validator: any, raw_object:Dictionary) : ValidatedOutput<undefined>
{
  return (ajv_validator(raw_object)) ? new ValidatedOutput(true, undefined) :
    new ValidatedOutput(false, undefined).pushError(
      ErrorStrings.YML.INVALID(ajv_validator.errors.map( (x:any) => x.message).join("\n"))
    )
}

export function printValidatedOutput(result: ValidatedOutput<any>)
{
    result.notice.forEach( (n:string) => console.log(chalk`{bold.blue NOTICE}: ${n}`))
    result.warning.forEach( (w:string) => console.log(chalk`{bold.yellow WARNING}: ${w}`))
    result.error.forEach( (e:string) => console.log(chalk`{bold.red ERROR}: ${e}`))
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

export function printOutputHeader(header: string, line_width:number = 80) 
{
  console.log(chalk`-- {bold ${header}} ${'-'.repeat(Math.max(0, line_width - header.length - 4))}`)
}

// function can send repeated requests if the first one fails
export async function waitUntilSuccess<T>(status: () => ValidatedOutput<T>, timeout:number = 2000, max_tries:number = 5) : Promise<ValidatedOutput<T>>
{
  let result: ValidatedOutput<any>|undefined
  for(var i = 0; i < Math.max(1, max_tries); i ++) {
    if(timeout > 0) await JSTools.sleep(timeout)
    result = status()
    if(result.success) return result
  }
  return result || status();
}

// create default environment for url variables that are exported by service commands
export function urlEnvironmentObject(url_str: string, additional_vars: {[key:string]: string} = {}, use_process_env:boolean = true) : {[key:string]: string}
{
    let href_env: {[key:string]: string} = {"URL": url_str}
    try {
        const url = new URL(url_str)
        href_env = {
            "URL": url_str,
            "URL_HREF": url.href,
            "URL_HOSTNAME": url.hostname,
            "URL_PORT": url.port,
            "URL_ORIGIN": url.origin,
            "URL_PATHNAME": url.pathname,
            "URL_SEARCH": url.search
        }        
    } catch {}

    return {
        ... (process.env as {[key:string]: string}),
        ... href_env,
        ... additional_vars
    }

}

// -- Syncthing two-way sync functions -----------------------------------------

export function initizeSyncManager(local_job_manager: JobManager, remote_job_manager: JobManager, resource: {key: string, username: string, ip: string}, ports: { listen: number, connect: number, gui: number}): MultiServiceManager<{"local": GenericAbstractService, "remote": GenericAbstractService}>
{
    const local_sync_manger = new SyncthingLocalService(
        local_job_manager,
        {
            "ports": { listen: ports.listen, connect: ports.connect},
            "ssh": { key: resource.key, username: resource.username, ip: resource.ip }
        }
    )
    const remote_sync_manger = new SyncthingRemoteService(
        remote_job_manager,
        {
            "ports": ports
        }
    )
    return new MultiServiceManager({"local": local_sync_manger, "remote": remote_sync_manger})
}