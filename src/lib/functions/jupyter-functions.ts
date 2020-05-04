import * as os from 'os'
import {JSTools} from '../js-tools'
import {ShellCommand} from '../shell-command'
import {ErrorStrings} from '../error-strings'
import {ValidatedOutput} from '../validated-output'
import {JUPYTER_JOB_NAME, name_label} from '../constants'
import {jobStart, jobExec, ContainerDrivers, OutputOptions, JobOptions, ports, labels, firstJobId} from './run-functions'
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

export function startJupyterInProject(container_runtime: ContainerDrivers, output_options: OutputOptions, jup_options: JupyterOptions) : ValidatedOutput<string>
{
  const jupyter_job_name = JUPYTER_JOB_NAME({"project-root" : jup_options['project-root'] || ""})
  const job_info_request = container_runtime.runner.jobInfo({
    'labels': { [name_label]: [jupyter_job_name]},
    'states': ['running']
  })
  // -- exit if request fails --------------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  // -- exit if jupyter is already running -------------------------------------
  const jupyter_job_id = firstJobId(job_info_request).value
  if(jupyter_job_id)
    return (new ValidatedOutput(true, jupyter_job_id)).pushWarning(ErrorStrings.JUPYTER.RUNNING(jupyter_job_id, {'project-root': jup_options['project-root'] || ""}))
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
      "labels":       jup_options['labels'].concat([{key: name_label, "value": jupyter_job_name}]),
      "remove":       true
    }
    // -- start job and extract job id -----------------------------------------
    const start_output = jobStart(container_runtime, job_options, output_options)
    if(!start_output.success) return new ValidatedOutput(false, "").absorb(start_output)
    return new ValidatedOutput(true, start_output.value.id) // return id of jupyter job
}

export function startJupyterInJob(container_runtime: ContainerDrivers, parent_job:{"id": string, "allowable-stack-paths"?: Array<string>}, output_options: OutputOptions, jup_options: JupyterOptions) : ValidatedOutput<string>
{
  const jupyter_job_name = JUPYTER_JOB_NAME({"job-id" : parent_job.id})
  const job_info_request = container_runtime.runner.jobInfo({
    'labels': { [name_label]: [jupyter_job_name]},
    'states': ['running']
  })
  // -- exit if request fails --------------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  // -- exit if jupyter is already running -------------------------------------
  const jupyter_job_id = firstJobId(job_info_request).value
  if(jupyter_job_id)
    return (new ValidatedOutput(true, jupyter_job_id)).pushWarning(ErrorStrings.JUPYTER.RUNNING(jupyter_job_id, {'job-id': parent_job.id}))
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
    "labels":       jup_options['labels'].concat([{key: name_label, "value": jupyter_job_name}]),
    "remove":       true
  }
  // -- start job and extract job id -------------------------------------------
  const exec_output = jobExec(container_runtime, parent_job, job_options, output_options)
  if(!exec_output.success) return new ValidatedOutput(false, "").absorb(exec_output)
  return new ValidatedOutput(true, exec_output.value.id) // return id of jupyter job
}

// -- extract the url for a jupyter notebook  ----------------------------------
export function stopJupyter(container_runtime: ContainerDrivers, identifier: {"job-id"?: string,"project-root"?: string}) : ValidatedOutput<undefined>
{
  const job_info_request = firstJobId(
    container_runtime.runner.jobInfo({
      'labels': { [name_label]: [JUPYTER_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const jupyter_job_id = job_info_request.value
  if(jupyter_job_id == "")
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  else
    return container_runtime.runner.jobStop([jupyter_job_id])
}

export function listJupyter(container_runtime: ContainerDrivers, identifier: {"job-id"?: string,"project-root"?: string}) : ValidatedOutput<undefined>
{
  const job_info_request = firstJobId(
    container_runtime.runner.jobInfo({
      'labels': { [name_label]: [JUPYTER_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const jupyter_job_id = job_info_request.value
  if(jupyter_job_id == "")
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  else {
    return new ValidatedOutput(true, undefined).absorb(
      container_runtime.runner.jobExec(jupyter_job_id,
        container_runtime.runner.emptyExecConfiguration( { command: ['jupyter', 'notebook', 'list'] } ),
        'inherit'
      )
    )
  }
}

// -- extract the url for a jupyter notebook  ----------------------------------
// function can send repeated requests if the first one fails
export async function getJupyterUrl(container_runtime: ContainerDrivers, identifier: {"job-id"?: string,"project-root"?: string}, max_tries:number = 5, timeout:number = 2000) : Promise<ValidatedOutput<string>>
{
  const job_info_request = firstJobId(
    container_runtime.runner.jobInfo({
      'labels': { [name_label]: [JUPYTER_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const jupyter_job_id = job_info_request.value
  if(jupyter_job_id == "") return (new ValidatedOutput(false, "")).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  var result = new ValidatedOutput(false, "").pushError(ErrorStrings.JUPYTER.NOURL)
  for(var i = 0; i < max_tries; i ++) {
    if(timeout > 0) await JSTools.sleep(timeout)
    result = parseNotebookListCommand(container_runtime.runner, jupyter_job_id)
    if(result.success) break
  }
  return result
}

// -- starts the Jupyter Electron app  -----------------------------------------
export function startJupyterApp(url: string, app_path: string, explicit: boolean = false) : ValidatedOutput<undefined>
{
  if(!app_path) return new ValidatedOutput(false, undefined)
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
  return new ValidatedOutput(true, undefined)
    .absorb(new ShellCommand(explicit, false).execAsync(command))
}

// === Helper functions ========================================================

// -- command to start jupyter
function jupyterCommand(jup_options: JupyterOptions) {
  const port = jup_options['ports']?.[0]?.containerPort || "";
  const has_args = jup_options['args'].length > 0;
  return `${jup_options['command']} ${(port) ? `--port=${port}` : ""}${(has_args) ? " " : ""}${jup_options['args'].join(" ")}`;
}

// -- extracts jupyter url from container (helper)
function parseNotebookListCommand(runner: RunDriver, jupyter_id: string) : ValidatedOutput<string>
{
  // -- get output from jupyter ------------------------------------------------
  const exec_result = runner.jobExec(
    jupyter_id,
    runner.emptyExecConfiguration( { command: ['jupyter', 'notebook', 'list'] } ),
    'pipe'
  )
  if(!exec_result.success) return new ValidatedOutput(false, "").absorb(exec_result)
  const raw_output = exec_result.value.output.trim().split("\n").pop() // get last non-empty line of output
  if(!raw_output) return new ValidatedOutput(false, "")
  // -- extract url ------------------------------------------------------------
  const re = /http:\/\/\S+:+\S*/ // matches http://X:X
  if(!re.test(raw_output)) return new ValidatedOutput(false, "")
  const url = raw_output.match(re)?.[0] || ""
  if(!url) return new ValidatedOutput(false, "")
  return new ValidatedOutput(true, url)
}
