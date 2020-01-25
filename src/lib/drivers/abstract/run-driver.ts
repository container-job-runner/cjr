// ===========================================================================
// Settings: A class for getting and setting
// ===========================================================================

import {ContainerDriver} from "./container-driver"
import {ValidatedOutput} from "../../validated-output"

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}

export abstract class RunDriver extends ContainerDriver
{
  // job functions
  abstract jobStart(stack_path: string, job_object: object, run_options: object): ValidatedOutput; // returns validated Object with data containing ID
  abstract jobList(stack_path: string) : ValidatedOutput;
  abstract jobLog(id: string) : ValidatedOutput;
  abstract jobAttach(id: string) : ValidatedOutput;
  abstract jobExec(id: string, exec_command: string, exec_options:Dictionary) : ValidatedOutput; // execute command in running container
  abstract jobInfo(stack_path: string) : Array<Dictionary>; //replace ID with more info (at least name and id)
  abstract jobDestroy(ids: Array<string>) : ValidatedOutput;
  abstract jobStop(ids: Array<string>) : ValidatedOutput;
  // result functions
  abstract resultList(stack_path: string) : ValidatedOutput;
  abstract resultInfo(stack_path: string) : Array<Dictionary>; // return at least id and name and remove resultIDs. Repeat with results.
  abstract resultDelete(ids: Array<string>) : ValidatedOutput;
  abstract resultCopy(id: string, job_object: object): ValidatedOutput
  abstract toImage(id: string, image_name: string): ValidatedOutput
}
