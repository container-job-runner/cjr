import os = require('os')
import { JSTools } from '../js-tools'
import { ShellCommand } from '../shell-command'
import { ErrorStrings } from '../error-strings'
import { ValidatedOutput } from '../validated-output'
import { label_strings } from '../constants'
import { firstJobId, JobInfo } from '../drivers-containers/abstract/run-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobManager } from '../job-managers/job-manager'
import { string } from '@oclif/command/lib/flags'

type JupyterOptions = {
  "stack_configuration": StackConfiguration<any> // stack configuration in which jupyter will be run
  "mode": "lab"|"notebook"    // lab or notebook
  "port": {hostPort: number, containerPort: number, address?: string} // port configuration for running jupyter
  "reuse-image"?: boolean     // specifies if image should be reused if already build
  "args"?: Array<string>      // additional args for jupyter command
  "x11"?: boolean             // optional x11 command
}

export type JupyterProjectOptions = JupyterOptions & {
  "project-root"?: string     // host project root
}

export type JupyterJobOptions = JupyterOptions & {
  "job-id": string      // host project root
}

export type JupyterJobInfo = {
  "id": string,
  "url": string,
  "project-root"?: string
  "parent-job-id"?: string
}

type JobIdentifer = {"job-id"?: string,"project-root"?: string}

export function startJupyterInProject(job_manager: JobManager, jupyter_options: JupyterProjectOptions) : ValidatedOutput<string>
{
  const identifier:JobIdentifer = {"project-root" : jupyter_options['project-root'] || ""}
  // -- check if jupyter is already running ----------------------------------------
  const job_id = jobId(identifier, job_manager)
  if(job_id.success)
    return job_id.pushWarning(ErrorStrings.JUPYTER.RUNNING(job_id.value, identifier))
  // -- start new jupyter job ------------------------------------------------------
  const job = job_manager.run(
    createJob(identifier, job_manager, jupyter_options),
    {
      "project-root": jupyter_options["project-root"],
      "cwd": jupyter_options["project-root"],
      "x11": jupyter_options["x11"],
      "reuse-image": jupyter_options["reuse-image"] || true,
      "project-root-file-access": "bind"
    }
  )
  if(!job.success) return new ValidatedOutput(false, "").absorb(job)
  return new ValidatedOutput(true, job.value.id)
}

export function startJupyterInJob(job_manager: JobManager, jupyter_options: JupyterJobOptions) : ValidatedOutput<string>
{
  const identifier:JobIdentifer = {"job-id" : jupyter_options["job-id"]}
  // -- exit if request fails --------------------------------------------------
  const job_id = jobId(identifier, job_manager)
  if(job_id.success)
    return job_id.pushWarning(ErrorStrings.JUPYTER.RUNNING(job_id.value, identifier))
  // -- start jupyter job -------------------------------------------------------
  const job = job_manager.exec(
    createJob(identifier, job_manager, jupyter_options),
    {
      "parent-id": jupyter_options["job-id"],
      "x11": jupyter_options["x11"],
      "reuse-image": jupyter_options["reuse-image"] || true
    }
  )
  if(!job.success) return new ValidatedOutput(false, "").absorb(job)
  return new ValidatedOutput(true, job.value.id)
}

// -- extract the url for a jupyter notebook  ----------------------------------
export function stopJupyter(job_manager: JobManager, identifier: {"job-id"?: string,"project-root"?: string}) : ValidatedOutput<undefined>
{
  const runner = job_manager.container_drivers.runner
  const job_id = jobId(identifier, job_manager)
  if(!job_id.success)
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  else
    return runner.jobStop([job_id.value])
}

// -- list all currently running jupyter servers --------------------------------
export function listJupyter(job_manager: JobManager, filter:"all"|"in-project"|"in-job") : ValidatedOutput<JupyterJobInfo[]>
{
  const jupyter_jobs: Array<JupyterJobInfo> = []
  const result = new ValidatedOutput(true, jupyter_jobs)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [label_strings.job.name]: [JUPYTER_JOB_PREFIX]},
    'states': ['running']
  })
  if(!job_info_request.success)
    return result.absorb(job_info_request)

  const include_injob = ( (filter === "all") || (filter === "in-job") )
  const include_inproject = ( (filter === "all") || (filter === "in-project") )

  job_info_request.value.map( (job:JobInfo) => {
    const job_type = job.labels?.[label_strings.job.type]
    if(job_type === "exec" && include_injob)
      jupyter_jobs.push({
          "id": job.id,
          "url": parseNotebookListCommand(job_manager, job.id).value,
          "parent-job-id": job.labels?.[label_strings.job["parent-job-id"]]
      })
    else if(job_type !== "exec" && include_inproject)
      jupyter_jobs.push({
        "id": job.id,
        "url": parseNotebookListCommand(job_manager, job.id).value,
        "project-root": job.labels?.[label_strings.job["project-root"]] || ""
      })
  })

  return result
}

// -- extract the url for a jupyter notebook  ----------------------------------
// function can send repeated requests if the first one fails
export async function getJupyterUrl(job_manager: JobManager, identifier: JobIdentifer, max_tries:number = 5, timeout:number = 2000) : Promise<ValidatedOutput<string>>
{
  const job_id = jobId(identifier, job_manager)
  if(!job_id.success)
    return (new ValidatedOutput(false, "")).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  var result = new ValidatedOutput(false, "").pushError(ErrorStrings.JUPYTER.NOURL)
  for(var i = 0; i < max_tries; i ++) {
    if(timeout > 0) await JSTools.sleep(timeout)
    result = parseNotebookListCommand(job_manager, job_id.value)
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

function createJob(identifier: JobIdentifer, job_manager: JobManager, jupyter_options: JupyterJobOptions | JupyterProjectOptions)
{
  const jupyter_job_name = JUPYTER_JOB_NAME(identifier)
  const stack_configuration = jupyter_options["stack_configuration"]
  stack_configuration.addPort(jupyter_options['port'].hostPort, jupyter_options['port'].containerPort, jupyter_options['port'].address)
  //stack_configuration.setEntrypoint(["/bin/sh", "-c"])
  // -- create new jupyter job -------------------------------------------------
  const job_configuration = job_manager.configurations.job(stack_configuration)
  job_configuration.addLabel(label_strings.job.name, jupyter_job_name)
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [jupyterCommand(jupyter_options)]

  return job_configuration
}

function jobId(identifier: JobIdentifer, job_manager: JobManager,) : ValidatedOutput<string>
{
  const jupyter_job_name = JUPYTER_JOB_NAME(identifier)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [label_strings.job.name]: [jupyter_job_name]},
    'states': ['running']
  })
  // -- return false if request fails ------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  // -- return success if id exists --------------------------------------------
  const jupyter_job_id = firstJobId(job_info_request).value
  if(jupyter_job_id)
    return (new ValidatedOutput(true, jupyter_job_id))
  return new ValidatedOutput(false, "")
}

// -- command to start jupyter
function jupyterCommand(jupyter_options: JupyterOptions) {
  const port = jupyter_options['port'].containerPort;
  const has_args = jupyter_options?.args !== undefined && jupyter_options?.args.length > 0
  return `jupyter ${jupyter_options['mode'] == 'lab' ? 'lab' : 'notebook'} --ip=0.0.0.0 ${(port) ? `--port=${port}` : ""}${(has_args) ? [" "].concat(jupyter_options.args || []).join(" ") : ""}`;
}

// -- extracts jupyter url from container (helper)
function parseNotebookListCommand(job_manager: JobManager, jupyter_id: string) : ValidatedOutput<string>
{
  // -- get output from jupyter ------------------------------------------------
  const exec_configuration = job_manager.configurations.exec()
  exec_configuration.command = ['jupyter', 'notebook', 'list']
  const exec_result = job_manager.container_drivers.runner.jobExec(jupyter_id, exec_configuration, 'pipe')
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

const JUPYTER_JOB_PREFIX = "JUPYTER-"
const JUPYTER_JOB_NAME = (identifier: JobIdentifer) => {
  if(identifier['project-root']) return `${JUPYTER_JOB_PREFIX}${JSTools.md5(identifier['project-root'])}`
  if(identifier['job-id']) return `${JUPYTER_JOB_PREFIX}${JSTools.md5(identifier['job-id'])}`
  return `${JUPYTER_JOB_PREFIX}[NONE]`;
}
