import path = require('path')
import { ShellCommand } from '../shell-command'
import { ErrorStrings, NoticeStrings } from '../error-strings'
import { ValidatedOutput } from '../validated-output'
import { label_strings } from '../constants'
import { parseJSON } from './misc-functions'
import { JobInfo, firstJob } from '../drivers-containers/abstract/run-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobManager } from '../job-managers/abstract/job-manager'
import { JSTools } from '../js-tools'

export type TheiaOptions = {
  "stack_configuration": StackConfiguration<any> // stack configuration in which jupyter will be run
  "port": {hostPort: number, containerPort: number, address?: string} // port configuration for running jupyter
  "project-root"?: string     // host project root
  "reuse-image"?: boolean     // specifies if image should be reused if already build
  "args"?: Array<string>      // additional args for jupyter command
  "x11"?: boolean             // optional x11 command
  "override-entrypoint"?: boolean // sets entrypoint to /bin/sh -c
  "access-ip"?: string // if this is set, then this ip address will be returned by jobId
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
const theia_label_strings = {'access-ip': "theia-access-ip"}

const THEIA_JOB_PREFIX = "THEIA-"
const THEIA_JOB_NAME = (identifier: JobIdentifer) => {
  if(identifier['project-root']) return `${THEIA_JOB_PREFIX}${JSTools.md5(identifier['project-root'])}`
  return `${THEIA_JOB_PREFIX}[NONE]`;
}

// === Core functions ==========================================================

export function startTheiaInProject(job_manager: JobManager, theia_options: TheiaOptions) : ValidatedOutput<{id: string, isnew: boolean}>
{
  const job_identifier = {"project-root" : theia_options['project-root'] || ""}
  // -- check if jupyter is already running ------------------------------------
  const job_id = theiaJobId(job_identifier, job_manager)
  if(job_id.success)
    return new ValidatedOutput(true, {
        "id": job_id.value, 
        "isnew": false
    }).pushNotice(NoticeStrings.THEIA.RUNNING(job_id.value, theia_options['project-root'] || ""))
  // -- start theia job --------------------------------------------------------
  const job = job_manager.run(
    createJob(job_identifier, job_manager, theia_options),
    {
      "project-root": theia_options["project-root"],
      "cwd": theia_options["project-root"],
      "x11": theia_options["x11"],
      "reuse-image": (theia_options?.["reuse-image"] !== undefined) ? theia_options["reuse-image"] : true,
      "project-root-file-access": "shared"
    }
  )
  if(!job.success) return new ValidatedOutput(false, {"id": "", isnew: true}).absorb(job)
  return new ValidatedOutput(true, {"id": job.value.id, isnew: true})
}

// -- extract the url for a jupyter notebook  ----------------------------------
export function stopAllTheias(job_manager: JobManager, copy_on_exit: boolean) : ValidatedOutput<undefined>
{
  const result = new ValidatedOutput(true, undefined)
  const jobs = listTheia(job_manager)
  if(!jobs.success)
    return result.pushError(ErrorStrings.THEIA.LIST_FAILED)

  const job_ids = jobs.value.map( (job: TheiaJobInfo) : string => job.id )
  if(copy_on_exit)
    result.absorb(
        job_manager.copy({
            "ids": job_ids,
            "mode": "update"
        })
    )
  
  result.absorb(
    job_manager.container_drivers.runner.jobStop(job_ids)
  )
  return result
}

// -- extract the url for a theia notebook  ------------------------------------
export function stopTheia(job_manager: JobManager, copy_on_exit: boolean, identifier: {"project-root"?: string}) : ValidatedOutput<undefined>
{
  const runner = job_manager.container_drivers.runner
  const job_id = theiaJobId(identifier, job_manager)
  if(!job_id.success)
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  const job_ids = [job_id.value]
  const result = new ValidatedOutput(true, undefined)
  if(copy_on_exit)
    result.absorb(
        job_manager.copy({
            "ids": job_ids,
            "mode": "update"
        })
    )  
  return result.absorb(runner.jobStop(job_ids))
}

export function listTheia(job_manager: JobManager) : ValidatedOutput<TheiaJobInfo[]>
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
      "url": extractUrlEnvVar(job_manager, job).value,
      "project-root": job.labels?.[label_strings.job["project-root"]] || ""
    })
  })

  return result
}

// -- extract the url for a theia server  --------------------------------------
export function getTheiaUrl(job_manager: JobManager, identifier: {"project-root"?: string}) : ValidatedOutput<string>
{
  const job_info_request = theiaJobInfo(identifier, job_manager)
  if(!job_info_request.success)
    return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  return extractUrlEnvVar(job_manager, job_info_request.value)
}

// -- starts the Theia Electron app  -------------------------------------------
export function runTheiaOnStartCommand(url: string, onstart_cmd: string, explicit: boolean = false) : ValidatedOutput<undefined>
{
  if(!onstart_cmd) return new ValidatedOutput(false, undefined)
  const command = [
        `export URL=${ShellCommand.bashEscape(url)}`,
        `export SERVER=theia`,
        onstart_cmd
    ].join(' ; ');
  return new ValidatedOutput(true, undefined)
    .absorb(new ShellCommand(explicit, false).execAsync(command))
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
  if(theia_options["access-ip"])
    job_configuration.addLabel(theia_label_strings['access-ip'], theia_options["access-ip"])
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [theiaCommand(stack_configuration, theia_options)]
  return job_configuration
}

function theiaJobInfo(identifier: JobIdentifer, job_manager: JobManager) : ValidatedOutput<JobInfo>
{
  const failure_output:JobInfo = {id: "", image: "", names: [], command: "", status: "", state: "dead", stack: "", labels: {}, ports: []}
  const theia_job_name = THEIA_JOB_NAME(identifier)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [label_strings.job.name]: [theia_job_name]},
    'states': ['running']
  })
  // -- return false if request fails ------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, failure_output)
  // -- return success if id exists --------------------------------------------
  return firstJob(job_info_request)
}

function theiaJobId(identifier: JobIdentifer, job_manager: JobManager) : ValidatedOutput<string>
{
    const fetch_job = theiaJobInfo(identifier, job_manager)
    if(fetch_job.success) return new ValidatedOutput(true, fetch_job.value.id)
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

function  extractUrlEnvVar(job_manager: JobManager, theia_job_info: JobInfo)
{
  const access_ip = theia_job_info.labels?.[theia_label_strings['access-ip']]
  const runner = job_manager.container_drivers.runner
  const exec_configuration = job_manager.configurations.exec()
  exec_configuration.command = ['bash', '-c', `echo '{"url":"'$${ENV.url}'","port":"'$${ENV.port}'"}'`]
  const exec_output = runner.jobExec(theia_job_info.id, exec_configuration, "pipe")
  const json_output = parseJSON(new ValidatedOutput(true, exec_output.value.output).absorb(exec_output)) // wrap output in ValidatedOutput<string> and pass to parseJSON
  if(!json_output.success) return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOURL)
  return new ValidatedOutput(true, `http://${(access_ip) ? access_ip : json_output.value?.url}:${json_output.value?.port}`);
}
