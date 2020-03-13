import {ValidatedOutput} from "../../validated-output"
import {BuildDriver} from "../../drivers/abstract/build-driver"
import {JobOptions, ContainerRuntime, CopyOptions, OutputOptions} from "../../functions/run-functions"
import {Resource} from "../../remote/config/resource-configuration"
type Dictionary = {[key: string]: any}

// NOTE: DEFINE ALL REMOTE TYPES BELOW
export type RemoteDeleteOptions = {
  "ids": Array<string>,
  "delete-images": boolean,
  "delete-files": boolean
}

export type RemoteExecOptions = {
  "id": string,                   // id of job that user wants to shell/exec into
  "host-project-root": string,         // current project root (used only for setting cwd in remote container)
  "mode": "job:exec"|"job:shell"
  "stack-upload-mode": "cached"|"uncached"
}

export type RemoteStartOptions = {
  "auto-copy": boolean,
  "file-upload-mode": "cached"|"uncached"
  "stack-upload-mode": "cached"|"uncached"
}

export abstract class RemoteDriver
{
  protected storage_directory: string // path that can be used for tmp files
  protected output_options: OutputOptions

  constructor(output_options: OutputOptions, storage_directory: string)
  {
    this.storage_directory = storage_directory
    this.output_options = output_options
  }

  abstract jobAttach(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;

  abstract jobCopy(resource: Dictionary, copy_options:CopyOptions): ValidatedOutput;
  abstract jobDelete(resource: Dictionary, delete_options:RemoteDeleteOptions): ValidatedOutput;

  abstract jobList(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobLog(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;

  abstract jobExec(resource: Resource, container_runtime:ContainerRuntime, job_options: JobOptions, exec_options: RemoteExecOptions): ValidatedOutput;
  abstract jobStart(resource: Resource, container_runtime:ContainerRuntime, job_options: JobOptions, remote_options:RemoteStartOptions): ValidatedOutput;

  abstract jobState(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;
  abstract jobStop(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>): ValidatedOutput;

  abstract connect(resource: Dictionary): ValidatedOutput
  abstract disconnect(resource: Dictionary): ValidatedOutput
  abstract jobInfo(resource: Dictionary, status: string): ValidatedOutput;
  abstract async promptUserForJobId(resource: Dictionary, interactive: boolean): Promise<string>

}
