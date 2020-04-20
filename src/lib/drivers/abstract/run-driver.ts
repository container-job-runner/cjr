// ===========================================================================
// RunDriver: Abstract class for running jobs and accessing their info
// ===========================================================================

import { ContainerDriver } from "./container-driver"
import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}
export type JobPortInfo = {
  ip: string,
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

export abstract class RunDriver extends ContainerDriver
{
  // ---------------------------------------------------------------------------
  // JOBINFO - returns information on running and completed jobs
  // -- Parameters -------------------------------------------------------------
  // 1. stack_paths: Array<string> - jobInfo only returns jobs whose stack_path
  //    matches with one of the values in this array. If stack_paths then jobs
  //    will not be filtered by stack_path.
  // 2. job_states: Array<string> - jobInfo only returns jobs whose state matches
  //    with one of the values in this array. if job_states=[] then jobs will
  //    not be filtered by job_state.
  // -- Returns ----------------------------------------------------------------
  // Array<JobInfo> - information from job
  // ---------------------------------------------------------------------------
  abstract jobInfo(stack_paths: Array<string>, job_states: Array<string>) : Array<Dictionary>;
  abstract jobStart(stack_path: string, configuration: StackConfiguration, callbacks:Dictionary): ValidatedOutput;
  abstract jobLog(id: string) : ValidatedOutput;
  abstract jobAttach(id: string) : ValidatedOutput;
  abstract jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary,  mode:"print"|"output"|"json") : ValidatedOutput;
  abstract jobToImage(id: string, image_name: string): ValidatedOutput
  abstract jobStop(ids: Array<string>) : ValidatedOutput;
  abstract jobDelete(ids: Array<string>) : ValidatedOutput;
  abstract volumeCreate(options:Dictionary): ValidatedOutput
  abstract volumeDelete(options:Dictionary): ValidatedOutput
}
