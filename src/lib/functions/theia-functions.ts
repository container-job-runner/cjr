import * as path from 'path'
import * as os from 'os'
import {JSTools} from '../js-tools'
import {ShellCommand} from '../shell-command'
import {ErrorStrings} from '../error-strings'
import {ValidatedOutput} from '../validated-output'
import {THEIA_JOB_NAME, name_label} from '../constants'
import {jobStart, jobExec, ContainerRuntime, OutputOptions, JobOptions, ports, labels, firstJobId} from './run-functions'
import {BuildOptions} from './build-functions'
import {BuildDriver} from '../drivers/abstract/build-driver'
import { parseJSON } from './misc-functions'

export type TheiaOptions = {
  "stack-path": string,
  "build-options"?: BuildOptions,
  "config-files"?: Array<string>,
  "project-root"?: string,
  "ports": ports,
  "hostname": string,
  "labels": labels,
  "args": Array<string>,
  "sync"?: boolean,
  "x11"?: boolean
}

const ENV = {
  url:  'THEIA_URL',
  port: 'THEIA_PORT'
}

export type Dictionary = {[key: string]: any}

// === Core functions ==========================================================

export function startTheiaInProject(container_runtime: ContainerRuntime, output_options: OutputOptions, theia_options: TheiaOptions) : ValidatedOutput<string>
{
  const theia_job_name = THEIA_JOB_NAME({"project-root" : theia_options['project-root'] || ""})
  const job_info_request = container_runtime.runner.jobInfo({
    'labels': { [name_label] : [theia_job_name] },
    'states': ['running']
  })
  // -- exit if request fails --------------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  const theia_job_id = firstJobId(job_info_request).value
  if(theia_job_id !== "")
    return (new ValidatedOutput(true, theia_job_id)).pushWarning(ErrorStrings.THEIA.RUNNING(theia_job_id, theia_options['project-root'] || ""))
  // -- start new theia job ----------------------------------------------------
  const job_options:JobOptions = {
      "stack-path":   theia_options["stack-path"],
      "config-files": theia_options["config-files"] || [],
      "build-options":theia_options["build-options"] || {'reuse-image': true},
      "command":      theiaCommand(container_runtime.builder, theia_options),
      "environment":  theiaEnvironment(theia_options),
      //"entrypoint": '["/bin/bash", "-c"]', // Uncomment this line socket based driver is developed
      "host-root":    theia_options["project-root"] || "",
      "cwd":          theia_options["project-root"] || "",
      "file-access":  "bind",
      "synchronous":  theia_options['sync'] || false,
      "x11":          theia_options['x11'] || false,
      "ports":        theia_options['ports'],
      "labels":       theia_options['labels'].concat([{key: name_label, "value": theia_job_name}]),
      "remove":       true
    }
    // -- start job and extract job id -----------------------------------------
    const start_output = jobStart(container_runtime, job_options, output_options)
    if(!start_output.success) return new ValidatedOutput(false, "").absorb(start_output)
    return new ValidatedOutput(true, start_output.value.id) // return id of theia job
}

// -- extract the url for a theia notebook  ------------------------------------
export function stopTheia(container_runtime: ContainerRuntime, identifier: {"project-root"?: string}) : ValidatedOutput<undefined>
{
  const job_info_request = firstJobId(
    container_runtime.runner.jobInfo({
      'labels': { [name_label]: [THEIA_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const theia_job_id = job_info_request.value
  if(theia_job_id == "")
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  else
    return container_runtime.runner.jobStop([theia_job_id])
}

// -- extract the url for a theia server  --------------------------------------
export async function getTheiaUrl(container_runtime: ContainerRuntime, identifier: {"project-root"?: string}) : Promise<ValidatedOutput<string>>
{
  const job_info_request = firstJobId(
    container_runtime.runner.jobInfo({
      'labels': { [name_label]: [THEIA_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const theia_job_id = job_info_request.value
  if(theia_job_id == "")
    return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  const exec_output = container_runtime.runner.jobExec(
    theia_job_id,
    container_runtime.runner.emptyExecConfiguration({
      command: ['bash', '-c', `echo '{"url":"'$${ENV.url}'","port":"'$${ENV.port}'"}'`]
    }),
    "pipe"
  )
  const json_output = parseJSON(new ValidatedOutput(true, exec_output.value.output).absorb(exec_output)) // wrap output in ValidatedOutput<string> and pass to parseJSON
  if(!json_output.success) return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOURL)
  return new ValidatedOutput(true, `http://${json_output.value?.url}:${json_output.value?.port}`);
}

// -- starts the Theia Electron app  -------------------------------------------
export function startTheiaApp(url: string, app_path: string, explicit: boolean = false) : ValidatedOutput<undefined>
{
  if(!app_path) return new ValidatedOutput(false, undefined)
  var app_cmd: string = ""
  const platform = os.platform()
  if(platform == "darwin")
    app_cmd = `open -n ${app_path}`
  else
    app_cmd = app_path

  const command = [
        `export URL=${ShellCommand.bashEscape(url)}`,
        `export ICON=theia`,
        app_cmd
    ].join(' && ');
  return new ValidatedOutput(false, undefined).absorb(
    (new ShellCommand(explicit, false)).execAsync(command)
  )
}

// === Helper functions ========================================================

// -- command to start theia server --------------------------------------------
function theiaCommand(builder: BuildDriver, theia_options: TheiaOptions) {
  const result = builder.loadConfiguration(theia_options['stack-path'], theia_options['config-files'] || [])
  const container_root = (result.success) ? (result.value?.getContainerRoot() || "") : ""
  const project_dir = (container_root && theia_options['project-root']) ? path.posix.join(container_root, path.basename(theia_options['project-root'])) : container_root
  return `theia --hostname $${ENV.url} --port $${ENV.port} ${project_dir}`;
}

// -- environment variables for THEIA ------------------------------------------
function theiaEnvironment(theia_options: TheiaOptions) {
  const env:Dictionary = {}
  env[ENV.port] = `${theia_options['ports']?.[0]?.containerPort || "8888"}`;
  env[ENV.url]  = theia_options['hostname'] || '0.0.0.0'
  return env;
}
