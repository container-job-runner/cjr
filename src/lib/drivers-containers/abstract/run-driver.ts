// ===========================================================================
// RunDriver: Abstract class for running jobs and accessing their info
// ===========================================================================

import { Dictionary, label_strings } from '../../constants'
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { JobConfiguration } from '../../config/jobs/job-configuration'
import { ExecConfiguration } from '../../config/exec/exec-configuration'
import { ShellCommand } from '../../shell-command'
import { JSTools } from '../../js-tools'

// -- types --------------------------------------------------------------------
export type JobPortInfo = {
  hostIp: string,
  containerPort: number,
  hostPort: number
}
export type JobState = "created"|"restarting"|"running"|"exited"|"paused"|"dead"|"unknown"
export type JobInfo = {
  id:      string,
  image:   string,
  names:   Array<string>,
  command: string,
  status:  string,
  state:   JobState,
  stack:   string
  labels:  {[key: string]: string},
  ports:   Array<JobPortInfo>
}
export type JobInfoFilter = {
  "stack-paths"?: Array<string>,
  "states"?: Array<JobState>,
  "ids"?: Array<string>
  "labels"?: { [key: string] : Array<string> | undefined }
}
export type NewJobInfo = {
  "id": string,
  "output": string,
  "exit-code": number
}

export abstract class RunDriver
{
  protected shell: ShellCommand

  constructor(shell: ShellCommand)
  {
    this.shell = shell;
  }

  // ---------------------------------------------------------------------------
  // JOBINFO - returns information on running and completed jobs
  // -- Parameters -------------------------------------------------------------
  // 1. filter: function only returns jobs that match with filter. If filter is
  //    note provided then all jobs are returned.
  //    -> "stack-paths": Array<string>
  //       jobInfo only returns jobs whose stack_pathmatches with one of the
  //       values in this array. If stack_paths then jobs will not be filtered
  //       by stack_path.
  //    -> "job-states": Array<JobState>
  //       jobInfo only returns jobs whose state matches with one of the values
  //       in this array. if job_states=[] then jobs will not be filtered by
  //       job_state.
  // -- Returns ----------------------------------------------------------------
  // ValidatedOutput<Array<JobInfo>> - information about matching job
  // ---------------------------------------------------------------------------
  abstract jobInfo(filter?: JobInfoFilter) : ValidatedOutput<Array<JobInfo>>;
  abstract jobStart(configuration: JobConfiguration<StackConfiguration<any>>, stdio:"inherit"|"pipe"): ValidatedOutput<NewJobInfo>;
  abstract jobLog(id: string, lines: string) : ValidatedOutput<string>;
  abstract jobAttach(id: string) : ValidatedOutput<undefined>;
  abstract jobExec(id: string, configuration: ExecConfiguration, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>;
  abstract jobToImage(id: string, image_name: string): ValidatedOutput<string>
  abstract jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  abstract jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  abstract volumeCreate(options?:Dictionary): ValidatedOutput<string>
  abstract volumeDelete(ids: Array<string>): ValidatedOutput<undefined>
}

// =============================================================================
// Helper functions for processing job Output
// =============================================================================

export function jobFilter(job_info:Array<JobInfo>, filter?: JobInfoFilter, options?: {blacklist: boolean, operator: "and"|"or"}) : Array<JobInfo>
{
  if(filter === undefined)
    return job_info

  // -- 1. Initialize filters functions once before search -------------------
  const filter_id:boolean = filter?.['ids'] !== undefined
  const id_regex = new RegExp(`^(${filter?.['ids']?.join('|') || ""})`)

  const filter_state:boolean = filter?.['states'] !== undefined
  const stateF = filter?.["states"]?.includes.bind(filter?.["states"]) || ((x:any) => true);

  const filter_stack_path:boolean = filter?.['stack-paths'] !== undefined
  const stackF = filter?.["stack-paths"]?.includes.bind(filter?.["stack-paths"]) || ((x:any) => true);

  const filter_labels:boolean = filter?.['labels'] !== undefined
  // -- initialize regular expressions for testing labels --------------------
  const filter_labels_keys = Object.keys(filter?.['labels'] || {}).filter((key:string) => filter?.['labels']?.[key] !== undefined) // filter out any undefined label searches
  const filter_labels_regex:{ [key:string] : RegExp} = {}
  filter_labels_keys.map((key: string) => {filter_labels_regex[key] = new RegExp(`^(${JSTools.regexEscape(filter?.['labels']?.[key]?.join('|') || "")})`)})
  // -- construct function for testing labels --------------------------------
  const labelsF = ( labels: { [key:string] : string } ) => {
    return filter_labels_keys.reduce( (accumulator: boolean, key: string) => {
      return accumulator && (filter_labels_regex?.[key]?.test(labels?.[key]) || false)
    },
    true)
  }

  // -- 2. Filter job information --------------------------------------------
  const mcs = [ // matching conditions
    (job: JobInfo) : boolean => (!filter_id || id_regex.test(job.id)),
    (job: JobInfo) : boolean => (!filter_stack_path || stackF(job.labels?.[label_strings.job["stack-path"]])),
    (job: JobInfo) : boolean => (!filter_state || stateF(job.state)),
    (job: JobInfo) : boolean => (!filter_labels || labelsF(job.labels))
  ]
  const or  = (a: boolean, b: boolean) => a || b
  const and = (a: boolean, b: boolean) => a && b
  const {op, init}  = (options?.operator == "or") ? {"op": or, "init": false} : {"op": and, "init": true}  // search operator and initial condition

  return job_info.filter( (job:JobInfo) => {
    const match = mcs.reduce((accum: boolean, F:(job: JobInfo) => boolean) => op(accum, F(job)), init)
    return ( options?.blacklist ) ? !match : match
  })
}

export function jobIds(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<Array<string>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true, job_info.value.map((ji:JobInfo) => ji.id))
}

export function jobLabels(job_info: ValidatedOutput<Array<JobInfo>>, label:string) : ValidatedOutput<Array<string>>
{
  if(!job_info.success) return new ValidatedOutput(false, [])
  return new ValidatedOutput(true,
    job_info.value
    .map((ji:JobInfo) => ji.labels?.[label])
    .filter((s:string|undefined) => s !== undefined)
  )
}

export function firstJobId(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<string>
{
  if(job_info.value.length < 1)
    return new ValidatedOutput(false, "")
  return new ValidatedOutput(true, job_info.value[0].id)
}

export function firstJob(job_info: ValidatedOutput<Array<JobInfo>>) : ValidatedOutput<JobInfo>
{
  const failure_output:JobInfo = {id: "", image: "", names: [], command: "", status: "", state: "dead", stack: "", labels: {}, ports: []}
  if(job_info.value.length < 1)
    return new ValidatedOutput(false, failure_output)
  return new ValidatedOutput(true, job_info.value[0])
}
