import path = require('path')
import os = require('os')
import { ShellCommand } from '../shell-command'
import { ErrorStrings, NoticeStrings } from '../error-strings'
import { ValidatedOutput } from '../validated-output'
import { label_strings } from '../constants'
import { parseJSON } from './misc-functions'
import { firstJobId, JobInfo } from '../drivers-containers/abstract/run-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobManager } from '../job-managers/job-manager'
import { JSTools } from '../js-tools'

export type TheiaOptions = {
  "stack_configuration": StackConfiguration<any> // stack configuration in which jupyter will be run
  "port": {hostPort: number, containerPort: number, address?: string} // port configuration for running jupyter
  "project-root"?: string     // host project root
  "reuse-image"?: boolean     // specifies if image should be reused if already build
  "args"?: Array<string>      // additional args for jupyter command
  "x11"?: boolean             // optional x11 command
  "override-entrypoint"?: boolean // sets entrypoint to /bin/sh -c
}

export type TheiaJobInfo = {
  "id": string,
  "url": string,
  "project-root"?: string
}

const ENV = {
  url:  'THEIA_URL',
  port: 'THEIA_PORT'
}

type JobIdentifer = {"project-root"?: string}

const THEIA_JOB_PREFIX = "THEIA-"
const THEIA_JOB_NAME = (identifier: JobIdentifer) => {
  if(identifier['project-root']) return `${THEIA_JOB_PREFIX}${JSTools.md5(identifier['project-root'])}`
  return `${THEIA_JOB_PREFIX}[NONE]`;
}

// === Core functions ==========================================================

export function startTheiaInProject(job_manager: JobManager, theia_options: TheiaOptions) : ValidatedOutput<string>
{
  const job_identifier = {"project-root" : theia_options['project-root'] || ""}
  // -- check if jupyter is already running ------------------------------------
  const job_id = jobId(job_identifier, job_manager)
  if(job_id.success)
    return job_id.pushNotice(NoticeStrings.THEIA.RUNNING(job_id.value, theia_options['project-root'] || ""))
  // -- start theia job --------------------------------------------------------
  const job = job_manager.run(
    createJob(job_identifier, job_manager, theia_options),
    {
      "project-root": theia_options["project-root"],
      "cwd": theia_options["project-root"],
      "x11": theia_options["x11"],
      "reuse-image": theia_options["reuse-image"] || true,
      "project-root-file-access": "bind"
    }
  )
  if(!job.success) return new ValidatedOutput(false, "").absorb(job)
  return new ValidatedOutput(true, job.value.id)
}

// -- extract the url for a jupyter notebook  ----------------------------------
export function stopAllTheias(job_manager: JobManager) : ValidatedOutput<undefined>
{
  const result = new ValidatedOutput(true, undefined)
  const jobs = listTheia(job_manager)
  if(!jobs.success)
    return result.pushError(ErrorStrings.THEIA.LIST_FAILED)

  const job_ids = jobs.value.map( (job: TheiaJobInfo) : string => job.id )
  result.absorb(
    job_manager.container_drivers.runner.jobStop(job_ids)
  )
  return result
}

// -- extract the url for a theia notebook  ------------------------------------
export function stopTheia(job_manager: JobManager, identifier: {"project-root"?: string}) : ValidatedOutput<undefined>
{
  const runner = job_manager.container_drivers.runner
  const job_id = jobId(identifier, job_manager)
  if(!job_id.success)
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  return runner.jobStop([job_id.value])
}

export function listTheia(job_manager: JobManager, host_ip: string="") : ValidatedOutput<TheiaJobInfo[]>
{
  const theia_jobs: Array<TheiaJobInfo> = []
  const result = new ValidatedOutput(true, theia_jobs)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [label_strings.job.name]: [THEIA_JOB_PREFIX]},
    'states': ['running']
  })
  if(!job_info_request.success)
    return result.absorb(job_info_request)

  job_info_request.value.map( (job:JobInfo) => {
    theia_jobs.push({
      "id": job.id,
      "url": extractUrlEnvVar(job_manager, job.id, host_ip).value,
      "project-root": job.labels?.[label_strings.job["project-root"]] || ""
    })
  })

  return result
}

// -- extract the url for a theia server  --------------------------------------
export function getTheiaUrl(job_manager: JobManager, identifier: {"project-root"?: string}, host_ip: string="") : ValidatedOutput<string>
{
  const job_id = jobId(identifier, job_manager)
  if(!job_id.success)
    return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  return extractUrlEnvVar(job_manager, job_id.value, host_ip)
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

// -- job configuration for running thia ---------------------------------------
function createJob(identifier: JobIdentifer, job_manager: JobManager, theia_options: TheiaOptions)
{
  const stack_configuration = theia_options["stack_configuration"]
  stack_configuration.addPort(theia_options['port'].hostPort, theia_options['port'].containerPort, theia_options['port'].address)
  setEnvironment(stack_configuration, theia_options)
  if(theia_options["override-entrypoint"])
    stack_configuration.setEntrypoint(["/bin/sh", "-c"])
  // -- create new jupyter job -------------------------------------------------
  const job_configuration = job_manager.configurations.job(stack_configuration)
  job_configuration.addLabel(label_strings.job.name, THEIA_JOB_NAME(identifier))
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [theiaCommand(stack_configuration, theia_options)]
  return job_configuration
}

function jobId(identifier: JobIdentifer, job_manager: JobManager,) : ValidatedOutput<string>
{
  const theia_job_name = THEIA_JOB_NAME(identifier)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [label_strings.job.name]: [theia_job_name]},
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

// -- command to start theia server --------------------------------------------
function theiaCommand(stack_configuration: StackConfiguration<any>, theia_options: TheiaOptions) {
  const container_root = stack_configuration.getContainerRoot()
  const project_dir = (container_root && theia_options['project-root']) ? path.posix.join(container_root, path.basename(theia_options['project-root'])) : container_root
  return `theia --hostname $${ENV.url} --port $${ENV.port} ${project_dir}`;
}

// -- environment variables for THEIA ------------------------------------------
function setEnvironment(stack_configuration: StackConfiguration<any>, theia_options: TheiaOptions) {
  stack_configuration.addEnvironmentVariable(ENV.port, `${theia_options['port'].containerPort}`)
  stack_configuration.addEnvironmentVariable(ENV.url, '0.0.0.0')
}

function  extractUrlEnvVar(job_manager: JobManager, job_id: string, host_ip: string="")
{
  const runner = job_manager.container_drivers.runner
  const exec_configuration = job_manager.configurations.exec()
  exec_configuration.command = ['bash', '-c', `echo '{"url":"'$${ENV.url}'","port":"'$${ENV.port}'"}'`]
  const exec_output = runner.jobExec(job_id, exec_configuration, "pipe")
  const json_output = parseJSON(new ValidatedOutput(true, exec_output.value.output).absorb(exec_output)) // wrap output in ValidatedOutput<string> and pass to parseJSON
  if(!json_output.success) return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOURL)
  return new ValidatedOutput(true, `http://${(host_ip) ? host_ip : json_output.value?.url}:${json_output.value?.port}`);
}
