// ===========================================================================
// Settings: A class for getting and setting
// ===========================================================================

import {ContainerDriver} from "./container-driver"

export abstract class RunDriver extends ContainerDriver
{
  // job functions
  abstract jobStart(stack_path: string, job_object: object, run_options: object={}): ValidatedObject; // returns validated Object with data containing ID
  abstract jobList(stack_path: string) : string;
  abstract jobLog(id: string) : string;
  abstract jobAttach(id: string) : string;
  abstract jobExec(id: string) : string; // execute command in running container
  abstract jobInfo(stack_path: string) : array<string>; //replace ID with more info (at least name and id)
  abstract jobDestroy(id: array<string>) : string;
  abstract jobStop(id: array<string>) : string;
  // result functions
  abstract resultList(stack_path: string) : string;
  abstract resultInfo(stack_path: string) : array<string>; // return at least id and name and remove resultIDs. Repeat with results.
  abstract resultDelete(id: string) : string;
  abstract resultCopy(id: string, job_object: object)
}
