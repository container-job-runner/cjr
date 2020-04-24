// ===========================================================================
// RunDriver: Abstract class for running jobs and accessing their info
// ===========================================================================

import { ContainerDriver } from "./container-driver"
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { stack_path_label, name_label } from '../../constants'

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
  "names"?: Array<string>
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
  abstract jobStart(stack_path: string, configuration: StackConfiguration, stdio:"inherit"|"pipe"): ValidatedOutput<NewJobInfo>;
  abstract jobLog(id: string) : ValidatedOutput<string>;
  abstract jobAttach(id: string) : ValidatedOutput<undefined>;
  abstract jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary, stdio:"inherit"|"pipe") : ValidatedOutput<NewJobInfo>;
  abstract jobToImage(id: string, image_name: string): ValidatedOutput<undefined>
  abstract jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  abstract jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  abstract volumeCreate(options:Dictionary): ValidatedOutput<string>
  abstract volumeDelete(options:Dictionary): ValidatedOutput<undefined>

  // A private helper function that can be used by JobInfo to filter jobs
  protected jobFilter(job_info:Array<JobInfo>, filter?: JobInfoFilter) : Array<JobInfo>
  {
    if(filter === undefined)
      return job_info

    const filter_id:boolean = filter?.['ids'] !== undefined
    const id_regex = new RegExp(`^(${filter?.['ids']?.join('|') || ""})`)

    const filter_name:boolean = filter?.['names'] !== undefined
    const name_regex = new RegExp(`^(${filter?.['names']?.join('|') || ""})`)

    const filter_stack_path:boolean = filter?.['stack-paths'] !== undefined
    const stackF = filter?.["stack-paths"]?.includes || ((x:any) => true);

    const filter_state:boolean = filter?.['states'] !== undefined
    const stateF = filter?.["stack-paths"]?.includes || ((x:any) => true);

    return job_info.filter((job:JobInfo) => {
      if(filter_id && !id_regex.test(job.id))
        return false
      if(filter_name && !name_regex.test(job.labels?.[name_label] || ""))
        return false
      if(filter_stack_path && !stackF(job.labels?.[stack_path_label]))
        return false
      if(filter_state && !stateF(job.state))
        return false
      return true
    })
  }

}
