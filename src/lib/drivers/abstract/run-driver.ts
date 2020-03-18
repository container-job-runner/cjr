// ===========================================================================
// Settings: A class for getting and setting
// ===========================================================================

import {ContainerDriver} from "./container-driver"
import {ValidatedOutput} from "../../validated-output"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"

// -- types --------------------------------------------------------------------
export type Dictionary = {[key: string]: any}

export abstract class RunDriver extends ContainerDriver
{
  abstract jobInfo(stack_paths: Array<string>, job_status: string) : Array<Dictionary>;
  abstract jobStart(stack_path: string, configuration: StackConfiguration, callbacks:Dictionary): ValidatedOutput;
  abstract jobLog(id: string) : ValidatedOutput;
  abstract jobAttach(id: string) : ValidatedOutput;
  abstract jobExec(id: string, exec_command: Array<string>, exec_options:Dictionary,  mode:"print"|"output") : ValidatedOutput;
  abstract jobToImage(id: string, image_name: string): ValidatedOutput
  abstract jobStop(ids: Array<string>) : ValidatedOutput;
  abstract jobDelete(ids: Array<string>) : ValidatedOutput;
  abstract volumeCreate(options:Dictionary): ValidatedOutput
  abstract volumeDelete(options:Dictionary): ValidatedOutput
}
