// ===========================================================================
// RunDriver: Abstract class for running jobs and accessing their info
// ===========================================================================

import { ContainerDriver } from "./container-driver"
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"

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
export type SearchFilter = {
  stack_paths?: Array<string>,
  job_states?: Array<JobState>
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
  abstract jobInfo(filter?: SearchFilter) : ValidatedOutput<Array<JobInfo>>;
  abstract jobStart(stack_path: string, configuration: StackConfiguration, callbacks:Dictionary): ValidatedOutput<string>;
  abstract jobLog(id: string) : ValidatedOutput<undefined>;
  abstract jobAttach(id: string) : ValidatedOutput<undefined>;
  abstract jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary,  mode:"print"|"output"|"json") : ValidatedOutput<undefined>|ValidatedOutput<String>;
  abstract jobToImage(id: string, image_name: string): ValidatedOutput<undefined>
  abstract jobStop(ids: Array<string>) : ValidatedOutput<undefined>
  abstract jobDelete(ids: Array<string>) : ValidatedOutput<undefined>
  abstract volumeCreate(options:Dictionary): ValidatedOutput<string>
  abstract volumeDelete(options:Dictionary): ValidatedOutput<undefined>
}
