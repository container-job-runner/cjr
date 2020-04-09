import * as path from 'path'
import * as os from 'os'
import {JSTools} from '../js-tools'
import {ShellCommand} from '../shell-command'
import {ErrorStrings} from '../error-strings'
import {ValidatedOutput} from '../validated-output'
import {THEIA_JOB_NAME} from '../constants'
import {jobNameLabeltoID, jobStart, jobExec, ContainerRuntime, OutputOptions, JobOptions, ports, labels} from './run-functions'
import {BuildDriver} from '../drivers/abstract/build-driver'

export type TheiaOptions = {
  "stack-path": string,
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

export function startTheiaInProject(container_runtime: ContainerRuntime, output_options: OutputOptions, theia_options: TheiaOptions)
{
  const theia_job_name = THEIA_JOB_NAME({"project-root" : theia_options['project-root'] || ""})
  const theia_job_id   = jobNameLabeltoID(container_runtime.runner, theia_job_name, theia_options['stack-path'], "running");
  if(theia_job_id !== false)
    return (new ValidatedOutput(true)).pushWarning(ErrorStrings.THEIA.RUNNING(theia_job_id))
  // -- start new theia job ----------------------------------------------------
  const job_options:JobOptions = {
      "stack-path":   theia_options["stack-path"],
      "config-files": theia_options["config-files"] || [],
      "build-mode":   "no-rebuild",
      "command":      theiaCommand(container_runtime.builder, theia_options),
      "environment":  theiaEnvironment(theia_options),
      //"entrypoint": '["/bin/bash", "-c"]', // Uncomment this line socket based driver is developed
      "host-root":    theia_options["project-root"] || "",
      "cwd":          theia_options["project-root"] || "",
      "file-access":  "bind",
      "synchronous":  theia_options['sync'] || false,
      "x11":          theia_options['x11'] || false,
      "ports":        theia_options['ports'],
      "labels":       theia_options['labels'].concat([{key:"name", "value": theia_job_name}]),
      "remove":       true
    }
    // -- start job and extract job id -----------------------------------------
    var result = jobStart(container_runtime, job_options, output_options)
    if(!result.success) return result
    return new ValidatedOutput(true, result.data) // return id of theia job
}

// -- extract the url for a theia notebook  ------------------------------------
export function stopTheia(container_runtime: ContainerRuntime, stack_path: string, identifier: {"project-root"?: string})
{
  const theia_job_id = jobNameLabeltoID(container_runtime.runner, THEIA_JOB_NAME(identifier), stack_path, "running");
  if(theia_job_id === false)
    return (new ValidatedOutput(false)).pushError(ErrorStrings.THEIA.NOTRUNNING)
  else
    return container_runtime.runner.jobStop([theia_job_id])
}

// -- extract the url for a theia server  --------------------------------------
export async function getTheiaUrl(container_runtime: ContainerRuntime, stack_path: string, identifier: {"project-root"?: string})
{
  const theia_job_id = jobNameLabeltoID(container_runtime.runner, THEIA_JOB_NAME(identifier), stack_path, "running");
  if(theia_job_id === false)
    return (new ValidatedOutput(false)).pushError(ErrorStrings.THEIA.NOTRUNNING)
  const result = container_runtime.runner.jobExec(theia_job_id, ['bash', '-c', `echo '{"url":"'$${ENV.url}'","port":"'$${ENV.port}'"}'`], {}, 'json')
  if(!result.success) return (new ValidatedOutput(false)).pushError(ErrorStrings.THEIA.NOURL)
  return new ValidatedOutput(true, `http://${result.data.url}:${result.data.port}`);
}

// -- starts the Theia Electron app  -------------------------------------------
export function startTheiaApp(url: string, app_path: string, explicit: boolean = false)
{
  if(!app_path) return new ValidatedOutput(false)
  var app_cmd: string = ""
  const platform = os.platform()
  if(platform == "darwin")
    app_cmd = `open ${app_path}`
  else
    app_cmd = app_path

  const command = [
        `export URL=${ShellCommand.bashEscape(url)}`,
        `export ICON=theia`,
        app_cmd
    ].join(' && ');
  return (new ShellCommand(explicit, false)).execAsync(command)
}

// === Helper functions ========================================================

// -- command to start theia server --------------------------------------------
function theiaCommand(builder: BuildDriver, theia_options: TheiaOptions) {
  const result = builder.loadConfiguration(theia_options['stack-path'], theia_options['config-files'] || [])
  const container_root = (result.success) ? (result.data?.getContainerRoot() || "") : ""
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
