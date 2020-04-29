// ===========================================================================
// RunDriver: Abstract class for running jobs and accessing their info
// ===========================================================================

import { stack_path_label, name_label } from '../../constants'
import { ContainerDriver } from "./container-driver"
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { JobConfiguration } from '../../config/jobs/job-configuration'

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}
export type JobPortInfo = {
  hostIp: string,
  containerPort: number,
  hostPort: number
}
export type JobState = "created"|"restarting"|"running"|"exited"|"paused"|"dead"|"unknown"
export type JobInfo = {
  id:      string,
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

export abstract class RunDriver extends ContainerDriver
{
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
  abstract jobStart(configuration: JobConfiguration<StackConfiguration>, stdio:"inherit"|"pipe"): ValidatedOutput<NewJobInfo>;
  abstract jobLog(id: string) : ValidatedOutput<string>;
  abstract jobAttach(id: string) : ValidatedOutput<undefined>;
  abstract jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>;
  abstract jobToImage(id: string, image_name: string): ValidatedOutput<string>
  abstract jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  abstract jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  abstract volumeCreate(options?:Dictionary): ValidatedOutput<string>
  abstract volumeDelete(ids: Array<string>): ValidatedOutput<undefined>

  abstract emptyJobConfiguration(stack_configuration?: StackConfiguration): JobConfiguration<StackConfiguration>

  // A private helper function that can be used by JobInfo to filter jobs
  // if blacklist parameter is false or unspecified, filter will whitelist.
  protected jobFilter(job_info:Array<JobInfo>, filter?: JobInfoFilter, blacklist?: boolean) : Array<JobInfo>
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
    filter_labels_keys.map((key: string) => {filter_labels_regex[key] = new RegExp(`^(${filter?.['labels']?.[key]?.join('|') || ""})`)})
    // -- construct function for testing labels --------------------------------
    const labelsF = ( labels: { [key:string] : string } ) => {
      return filter_labels_keys.reduce( (accumulator: boolean, key: string) => {
        return accumulator && (filter_labels_regex?.[key]?.test(labels?.[key]) || false)
      },
      true)
    }

    // -- 2. Filter job information --------------------------------------------
    const failure_condition = (blacklist) ? true : false
    return job_info.filter((job:JobInfo) => {
      if(filter_id && id_regex.test(job.id) == failure_condition)
        return false
      if(filter_stack_path && !stackF(job.labels?.[stack_path_label]))
        return false
      if(filter_state && stateF(job.state) == failure_condition)
        return false
      if(filter_labels && labelsF(job.labels) == failure_condition)
        return false
      return true
    })
  }

}
