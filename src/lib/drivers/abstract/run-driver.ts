// ===========================================================================
// Settings: A class for getting and setting
// ===========================================================================

import {ContainerDriver} from "./container-driver"
import {ValidatedOutput} from "../../validated-output"

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}

export abstract class RunDriver extends ContainerDriver
{
  abstract jobInfo(stack_path: string, job_status: string) : Array<Dictionary>;
  abstract jobStart(stack_path: string, job_object: object, run_options: object, callbacks: Dictionary): ValidatedOutput;
  abstract jobLog(id: string) : ValidatedOutput;
  abstract jobAttach(id: string) : ValidatedOutput;
  abstract jobExec(id: string, exec_command: string, exec_options:Dictionary) : ValidatedOutput;
  abstract jobCopy(id: string, job_object: object, copy_all: boolean, verbose: boolean): ValidatedOutput
  abstract jobToImage(id: string, image_name: string): ValidatedOutput
  abstract jobStop(ids: Array<string>) : ValidatedOutput;
  abstract jobDelete(ids: Array<string>) : ValidatedOutput;
}
