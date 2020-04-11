import * as os from 'os'
import {JSTools} from '../js-tools'
import {ShellCommand} from '../shell-command'
import {ErrorStrings} from '../error-strings'
import {ValidatedOutput} from '../validated-output'
import {JUPYTER_JOB_NAME} from '../constants'
import {jobNameLabeltoID, jobStart, jobExec, ContainerRuntime, OutputOptions, JobOptions, ports, labels} from './run-functions'
import {BuildOptions} from './build-functions'
import {RunDriver} from '../drivers/abstract/run-driver'

export type JupyterOptions = {
  "stack-path": string,
  "build-options"?: BuildOptions,
  "config-files"?: Array<string>,
  "project-root"?: string,
  "ports": ports,
  "labels": labels,
  "command": string,
  "args": Array<string>,
  "sync"?: boolean,
  "x11"?: boolean
}

// === Core functions ==========================================================

export function startJupyterInProject(container_runtime: ContainerRuntime, output_options: OutputOptions, jup_options: JupyterOptions)
{
  const jupyter_job_name = JUPYTER_JOB_NAME({"project-root" : jup_options['project-root'] || ""})
  const jupyter_job_id   = jobNameLabeltoID(container_runtime.runner, jupyter_job_name, jup_options['stack-path'], "running");
  if(jupyter_job_id !== false)
    return (new ValidatedOutput(true)).pushWarning(ErrorStrings.JUPYTER.RUNNING(jupyter_job_id))
  // -- start new jupyter job --------------------------------------------------
  const job_options:JobOptions = {
      "stack-path":   jup_options["stack-path"],
      "config-files": jup_options["config-files"] || [],
      "build-options":jup_options["build-options"] || {'reuse-image': true},
      "command":      jupyterCommand(jup_options),
      //"entrypoint": '["/bin/bash", "-c"]', // Uncomment this line socket based driver is developed
      "host-root":    jup_options["project-root"] || "",
      "cwd":          jup_options["project-root"] || "",
      "file-access":  "bind",
      "synchronous":  jup_options['sync'] || false,
      "x11":          jup_options['x11'] || false,
      "ports":        jup_options['ports'],
      "labels":       jup_options['labels'].concat([{key:"name", "value": jupyter_job_name}]),
      "remove":       true
    }
    // -- start job and extract job id -----------------------------------------
    var result = jobStart(container_runtime, job_options, output_options)
    if(!result.success) return result
    return new ValidatedOutput(true, result.data) // return id of jupyter job
}

export function startJupyterInJob(container_runtime: ContainerRuntime, job_id:string, output_options: OutputOptions, jup_options: JupyterOptions)
{
  const jupyter_job_name = JUPYTER_JOB_NAME({"job-id" : job_id})
  const jupyter_job_id   = jobNameLabeltoID(container_runtime.runner, jupyter_job_name, jup_options['stack-path'], "running");
  if(jupyter_job_id !== false)
    return (new ValidatedOutput(true)).pushWarning(ErrorStrings.JUPYTER.RUNNING(jupyter_job_id))
  // -- start new jupyter job --------------------------------------------------
  const job_options:JobOptions = {
    "stack-path":   jup_options["stack-path"],
    "config-files": jup_options["config-files"] || [],
    "build-options":jup_options["build-options"] || {'reuse-image': true},
    "command":      jupyterCommand(jup_options),
    //"entrypoint": '["/bin/bash", "-c"]', // Uncomment this line once socket based driver is developed
    "cwd":          jup_options["project-root"] || "",
    "file-access":  "volume",
    "synchronous":  jup_options['sync'] || false,
    "x11":          jup_options['x11'] || false,
    "ports":        jup_options['ports'],
    "labels":       jup_options['labels'].concat([{key:"name", "value": jupyter_job_name}]),
    "remove":       true
  }
  // -- start job and extract job id -------------------------------------------
  const result = jobExec(container_runtime, job_id, job_options, output_options)
  if(!result.success) return result
  return new ValidatedOutput(true, result.data) // return id of jupyter job
}

// -- extract the url for a jupyter notebook  ----------------------------------
export function stopJupyter(container_runtime: ContainerRuntime, stack_path: string, identifier: {"job-id"?: string,"project-root"?: string})
{
  const jupyter_job_id = jobNameLabeltoID(container_runtime.runner, JUPYTER_JOB_NAME(identifier), stack_path, "running");
  if(jupyter_job_id === false)
    return (new ValidatedOutput(false)).pushError(ErrorStrings.JUPYTER.NOTRUNNING)
  else
    return container_runtime.runner.jobStop([jupyter_job_id])
}

export function listJupyter(container_runtime: ContainerRuntime, stack_path: string, identifier: {"job-id"?: string,"project-root"?: string})
{
  const jupyter_job_id = jobNameLabeltoID(container_runtime.runner, JUPYTER_JOB_NAME(identifier), stack_path, "running");
  if(jupyter_job_id === false)
    return (new ValidatedOutput(false)).pushError(ErrorStrings.JUPYTER.NOTRUNNING)
  else
    return container_runtime.runner.jobExec(jupyter_job_id, ['jupyter', 'notebook', 'list'], {}, 'print')
}

// -- extract the url for a jupyter notebook  ----------------------------------
// function can send repeated requests if the first one fails
export async function getJupyterUrl(container_runtime: ContainerRuntime, stack_path: string, identifier: {"job-id"?: string,"project-root"?: string}, max_tries:number = 5, timeout:number = 2000)
{
  const jupyter_job_id = jobNameLabeltoID(container_runtime.runner, JUPYTER_JOB_NAME(identifier), stack_path, "running");
  if(jupyter_job_id === false) return (new ValidatedOutput(false)).pushError(ErrorStrings.JUPYTER.NOTRUNNING)
  var result = new ValidatedOutput(false).pushError(ErrorStrings.JUPYTER.NOURL)
  for(var i = 0; i < max_tries; i ++) {
    if(timeout > 0) await JSTools.sleep(timeout)
    result = await parseNotebookListCommand(container_runtime.runner, jupyter_job_id)
    if(result.success) break
  }
  return result
}

// -- starts the Jupyter Electron app  -----------------------------------------
export function startJupyterApp(url: string, app_path: string, explicit: boolean = false)
{
  if(!app_path) return new ValidatedOutput(false)
  const platform = os.platform()
  var app_cmd: string = ""
  if(platform == "darwin")
    app_cmd = `open -n ${app_path}`
  else
    app_cmd = app_path

  const command = [
        `export URL=${ShellCommand.bashEscape(url)}`,
        `export ICON=jupyter`,
        app_cmd
    ].join(' && ');
  return (new ShellCommand(explicit, false)).execAsync(command)
}

// === Helper functions ========================================================

// -- command to start jupyter
function jupyterCommand(jup_options: JupyterOptions) {
  const port = jup_options['ports']?.[0]?.containerPort || "";
  const has_args = jup_options['args'].length > 0;
  return `${jup_options['command']} ${(port) ? `--port=${port}` : ""}${(has_args) ? " " : ""}${jup_options['args'].join(" ")}`;
}

// -- extracts jupyter url from container (helper)
function parseNotebookListCommand(runner: RunDriver, jupyter_id: string)
{
  // -- get output from jupyter ------------------------------------------------
  const result = runner.jobExec(jupyter_id, ['jupyter', 'notebook', 'list'], {}, 'output')
  if(!result.success) return result
  const raw_output = (result.data as string).trim().split("\n").pop() // get last non-empty line of output
  if(!raw_output) return new ValidatedOutput(false)
  // -- extract url ------------------------------------------------------------
  const re = /http:\/\/\S+:+\S*/ // matches http://X:X
  if(!re.test(result.data)) return new ValidatedOutput(false)
  const url = raw_output.match(re)?.[0] || ""
  if(!url) return new ValidatedOutput(false)
  return new ValidatedOutput(true, url)
}
