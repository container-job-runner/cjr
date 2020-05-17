import os = require('os')
import { JSTools } from '../js-tools'
import { ShellCommand } from '../shell-command'
import { ErrorStrings } from '../error-strings'
import { ValidatedOutput } from '../validated-output'
import { JUPYTER_JOB_NAME, name_label } from '../constants'
import { firstJobId } from '../drivers-containers/abstract/run-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobManager, Configurations, OutputOptions, ContainerDrivers } from '../job-managers/job-manager'

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

export function startJupyterInProject(job_manager: JobManager, jupyter_options: JupyterProjectOptions) : ValidatedOutput<string>
{
  const identifier = {"project-root" : jupyter_options['project-root'] || ""}
  const jupyter_job_name = JUPYTER_JOB_NAME(identifier)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [name_label]: [jupyter_job_name]},
    'states': ['running']
  })
  // -- exit if request fails --------------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  // -- exit if jupyter is already running -------------------------------------
  const jupyter_job_id = firstJobId(job_info_request).value
  if(jupyter_job_id)
    return (new ValidatedOutput(true, jupyter_job_id)).pushWarning(ErrorStrings.JUPYTER.RUNNING(jupyter_job_id, identifier))
  // -- add port to jupyter stack ----------------------------------------------
  const stack_configuration = jupyter_options["stack_configuration"]
  stack_configuration.addPort(jupyter_options['port'].hostPort, jupyter_options['port'].containerPort, jupyter_options['port'].address)
  //stack_configuration.setEntrypoint(["/bin/sh", "-c"])
  // -- create new jupyter job -------------------------------------------------
  const job_configuration = job_manager.configurations.job(stack_configuration)
  job_configuration.addLabel(name_label, jupyter_job_name)
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [jupyterCommand(jupyter_options)]
  // -- start jupyter job -------------------------------------------------------
  const job = job_manager.run(
    job_configuration,
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

export function startJupyterInJob(job_manager: JobManager, container_drivers: ContainerDrivers, configurations: Configurations, output_options: OutputOptions, jupyter_options: JupyterJobOptions) : ValidatedOutput<string>
{
  const jupyter_job_name = JUPYTER_JOB_NAME({"job-id" : jupyter_options["job-id"]})
  const job_info_request = container_drivers.runner.jobInfo({
    'labels': { [name_label]: [jupyter_job_name]},
    'states': ['running']
  })
  // -- exit if request fails --------------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  // -- exit if jupyter is already running -------------------------------------
  const jupyter_job_id = firstJobId(job_info_request).value
  if(jupyter_job_id)
    return (new ValidatedOutput(true, jupyter_job_id)).pushWarning(ErrorStrings.JUPYTER.RUNNING(jupyter_job_id, {'job-id': jupyter_options["job-id"]}))
  // -- add port to jupyter stack ----------------------------------------------
  const stack_configuration = jupyter_options["stack_configuration"]
  stack_configuration.addPort(jupyter_options['port'].hostPort, jupyter_options['port'].containerPort, jupyter_options['port'].address)
  //stack_configuration.setEntrypoint(["/bin/sh", "-c"])
  // -- create new jupyter job -------------------------------------------------
  const job_configuration = configurations.job(stack_configuration)
  job_configuration.addLabel(name_label, jupyter_job_name)
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [jupyterCommand(jupyter_options)]
  // -- start jupyter job -------------------------------------------------------
  const job = job_manager.exec(
    job_configuration,
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
export function stopJupyter(drivers: ContainerDrivers, identifier: {"job-id"?: string,"project-root"?: string}) : ValidatedOutput<undefined>
{
  const job_info_request = firstJobId(
    drivers.runner.jobInfo({
      'labels': { [name_label]: [JUPYTER_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const jupyter_job_id = job_info_request.value
  if(jupyter_job_id == "")
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  else
    return drivers.runner.jobStop([jupyter_job_id])
}

export function listJupyter(drivers: ContainerDrivers, configurations: Configurations, identifier: {"job-id"?: string,"project-root"?: string}) : ValidatedOutput<undefined>
{
  console.log(JUPYTER_JOB_NAME(identifier))
  const job_info_request = firstJobId(
    drivers.runner.jobInfo({
      'labels': { [name_label]: [JUPYTER_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const jupyter_job_id = job_info_request.value
  if(jupyter_job_id == "")
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  else {
    const exec_configuration = configurations.exec()
    exec_configuration.command = ['jupyter', 'notebook', 'list']
    return new ValidatedOutput(true, undefined).absorb(
      drivers.runner.jobExec(jupyter_job_id, exec_configuration, 'inherit')
    )
  }
}

// -- extract the url for a jupyter notebook  ----------------------------------
// function can send repeated requests if the first one fails
export async function getJupyterUrl(drivers: ContainerDrivers, configurations: Configurations, identifier: {"job-id"?: string,"project-root"?: string}, max_tries:number = 5, timeout:number = 2000) : Promise<ValidatedOutput<string>>
{
  const job_info_request = firstJobId(
    drivers.runner.jobInfo({
      'labels': { [name_label]: [JUPYTER_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const jupyter_job_id = job_info_request.value
  if(jupyter_job_id == "") return (new ValidatedOutput(false, "")).pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  var result = new ValidatedOutput(false, "").pushError(ErrorStrings.JUPYTER.NOURL)
  for(var i = 0; i < max_tries; i ++) {
    if(timeout > 0) await JSTools.sleep(timeout)
    result = parseNotebookListCommand(drivers, configurations, jupyter_job_id)
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
function jupyterCommand(jupyter_options: JupyterOptions) {
  const port = jupyter_options['port'].containerPort;
  const has_args = jupyter_options?.args !== undefined && jupyter_options?.args.length > 0
  return `jupyter ${jupyter_options['mode'] == 'lab' ? 'lab' : 'notebook'} --ip=0.0.0.0 ${(port) ? `--port=${port}` : ""}${(has_args) ? [" "].concat(jupyter_options.args || []).join(" ") : ""}`;
}

// -- extracts jupyter url from container (helper)
function parseNotebookListCommand(drivers: ContainerDrivers, configurations: Configurations, jupyter_id: string) : ValidatedOutput<string>
{
  // -- get output from jupyter ------------------------------------------------
  const exec_configuration = configurations.exec()
  exec_configuration.command = ['jupyter', 'notebook', 'list']
  const exec_result = drivers.runner.jobExec(jupyter_id, exec_configuration, 'pipe')
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
