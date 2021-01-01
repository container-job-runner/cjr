import { JSTools } from '../js-tools'
import { ShellCommand } from '../shell-command'
import { ErrorStrings, NoticeStrings } from '../error-strings'
import { ValidatedOutput } from '../validated-output'
import { label_strings } from '../constants'
import { firstJobId, JobInfo, firstJob } from '../drivers-containers/abstract/run-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobManager } from '../job-managers/abstract/job-manager'

type JupyterOptions = {
  "stack_configuration": StackConfiguration<any> // stack configuration in which jupyter will be run
  "mode": "lab"|"notebook"    // lab or notebook
  "port": {hostPort: number, containerPort: number, address?: string} // port configuration for running jupyter
  "reuse-image"?: boolean     // specifies if image should be reused if already build
  "args"?: Array<string>      // additional args for jupyter command
  "x11"?: boolean             // optional x11 command
  "override-entrypoint"?: boolean // sets entrypoint to /bin/sh -c
  "access-ip"?: string // if this is set, then this ip address will be returned by jobId
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
const jupyter_label_strings = {'access-ip': "jupyter-access-ip"}

export function startJupyterInProject(job_manager: JobManager, jupyter_options: JupyterProjectOptions) : ValidatedOutput<{id: string, isnew: boolean}>
{
  const failure = new ValidatedOutput(false, {id: "", isnew: true})
  // -- standardize identifier -----------------------------------------------------
  const identifier:JobIdentifer = {"project-root" : jupyter_options['project-root'] || ""}
  const SJI = toStandardJupyterIdentifier(job_manager, identifier)
  if(!SJI.success) return failure.absorb(SJI)
  // -- check if jupyter is already running ----------------------------------------
  const fetch_job_id = jupyterJobId(identifier, job_manager)
  if(fetch_job_id.success)
    return new ValidatedOutput(true, {
        "id": fetch_job_id.value, 
        "isnew": false
    }).pushNotice(NoticeStrings.JUPYTER.RUNNING(fetch_job_id.value, identifier))
  // -- start new jupyter job ------------------------------------------------------
  const job = job_manager.run(
    createJob(identifier, job_manager, jupyter_options),
    {
      "project-root": jupyter_options["project-root"],
      "cwd": jupyter_options["project-root"],
      "x11": jupyter_options["x11"],
      "reuse-image": (jupyter_options?.["reuse-image"] !== undefined) ? jupyter_options["reuse-image"] : true,
      "project-root-file-access": "shared"
    }
  )
  if(!job.success) 
    return failure.absorb(job)
  return new ValidatedOutput(true, {"id": job.value.id, "isnew": true})
}

export function startJupyterInJob(job_manager: JobManager, jupyter_options: JupyterJobOptions) : ValidatedOutput<{id: string, isnew: boolean}>
{
  const failure = new ValidatedOutput(false, {id: "", isnew: true})
  // -- standardize identifier ------------------------------------------------
  const identifier:JobIdentifer = {"job-id" : jupyter_options["job-id"]}
  const SJI = toStandardJupyterIdentifier(job_manager, identifier)
  if(!SJI.success) return failure.absorb(SJI)
  // -- exit if request fails --------------------------------------------------
  const fetch_job_id = jupyterJobId(identifier, job_manager)
  if(fetch_job_id.success)
    return new ValidatedOutput(true, {
        "id": fetch_job_id.value, 
        "isnew": false
    }).pushNotice(NoticeStrings.JUPYTER.RUNNING(fetch_job_id.value, identifier))
  // -- start jupyter job -------------------------------------------------------
  const job = job_manager.exec(
    createJob(identifier, job_manager, jupyter_options),
    {
      "parent-id": jupyter_options["job-id"],
      "x11": jupyter_options["x11"],
      "reuse-image": jupyter_options["reuse-image"] || true
    }
  )
  if(!job.success) 
    return failure.absorb(job)
  return new ValidatedOutput(true, {"id": job.value.id, "isnew": true})
}

// -- extract the url for a jupyter notebook  ---------------------------------
export function stopJupyter(job_manager: JobManager, copy_on_exit: boolean, identifier: JobIdentifer) : ValidatedOutput<undefined>
{
  const result = new ValidatedOutput(true, undefined)
  // -- standardize identifier ------------------------------------------------
  const SJI = toStandardJupyterIdentifier(job_manager, identifier)
  if(!SJI.success) return result.absorb(SJI)
  // stop jupyter
  const runner = job_manager.container_drivers.runner
  const fetch_job_id = jupyterJobId(identifier, job_manager)
  const job_ids = [fetch_job_id.value];
      
  if(!fetch_job_id.success)
    return result.pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  
  if(copy_on_exit)
    result.absorb(
        job_manager.copy({
            "ids": job_ids,
            "mode": "update"
        })
    )
    
  return result.absorb(runner.jobStop(job_ids)) 
}

// -- extract the url for a jupyter notebook  ----------------------------------
export function stopAllJupyters(job_manager: JobManager, copy_on_exit: boolean, filter:"all"|"in-project"|"in-job") : ValidatedOutput<undefined>
{
  const result = new ValidatedOutput(true, undefined)
  const jobs = listJupyter(job_manager, filter)
  if(!jobs.success)
    return result.pushError(ErrorStrings.JUPYTER.LIST_FAILED)

  const job_ids = jobs.value.map( (job: JupyterJobInfo) : string => job.id )
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
    const access_ip = job.labels?.[jupyter_label_strings['access-ip']]
    if(job_type === "exec" && include_injob)
      jupyter_jobs.push({
          "id": job.id,
          "url": mapJupyterUrl(parseNotebookListCommand(job_manager, job.id).value, access_ip),
          "parent-job-id": job.labels?.[label_strings.job["parent-job-id"]]
      })
    else if(job_type !== "exec" && include_inproject)
      jupyter_jobs.push({
        "id": job.id,
        "url": mapJupyterUrl(parseNotebookListCommand(job_manager, job.id).value, access_ip),
        "project-root": job.labels?.[label_strings.job["project-root"]] || ""
      })
  })

  return result
}

// -- extract the url for a jupyter notebook  ----------------------------------
// function can send repeated requests if the first one fails
export async function getJupyterUrl(job_manager: JobManager, identifier: JobIdentifer, max_tries:number = 5, timeout:number = 2000) : Promise<ValidatedOutput<string>>
{
  const failure = new ValidatedOutput(false, "");
  // -- standardize identifier -------------------------------------------------
  const SJI = toStandardJupyterIdentifier(job_manager, identifier)
  if(!SJI.success) return failure.absorb(SJI)

  const fetch_job = jupyterJobInfo(identifier, job_manager)
  if(!fetch_job.success) 
    return failure.pushError(ErrorStrings.JUPYTER.NOT_RUNNING(identifier))
  const job = fetch_job.value  
  // extract id and access url
  const job_id = job.id;
  const access_ip = job.labels?.[jupyter_label_strings['access-ip']]

  var result = new ValidatedOutput(false, "").pushError(ErrorStrings.JUPYTER.NOURL)
  for(var i = 0; i < max_tries; i ++) {
    if(timeout > 0) await JSTools.sleep(timeout)
    result = parseNotebookListCommand(job_manager, job_id)
    if(result.success) break
  }
  // replace url if access_ip is specified
  return new ValidatedOutput(result.success, mapJupyterUrl(result.value, access_ip))
}

// -- starts the Jupyter Electron app  -----------------------------------------
export function runJupyterOnStartCommand(url: string, onstart_cmd: string, explicit: boolean = false) : ValidatedOutput<undefined>
{
  if(!onstart_cmd) return new ValidatedOutput(false, undefined)
  const command = [
        `export URL=${ShellCommand.bashEscape(url)}`,
        `export SERVER=jupyter`,
        onstart_cmd
    ].join(' ; ');
  return new ValidatedOutput(true, undefined)
    .absorb(new ShellCommand(explicit, false).execAsync(command))
}

// === Helper functions ========================================================

function createJob(identifier: JobIdentifer, job_manager: JobManager, jupyter_options: JupyterJobOptions | JupyterProjectOptions)
{
  const jupyter_job_name = JUPYTER_JOB_NAME(identifier)
  const stack_configuration = jupyter_options["stack_configuration"]
  stack_configuration.addPort(jupyter_options['port'].hostPort, jupyter_options['port'].containerPort, jupyter_options['port'].address)
  if(jupyter_options["override-entrypoint"])
    stack_configuration.setEntrypoint(["/bin/sh", "-c"])
  // -- create new jupyter job -------------------------------------------------
  const job_configuration = job_manager.configurations.job(stack_configuration)
  job_configuration.addLabel(label_strings.job.name, jupyter_job_name)
  if(jupyter_options["access-ip"])
    job_configuration.addLabel(jupyter_label_strings['access-ip'], jupyter_options["access-ip"])
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [jupyterCommand(jupyter_options)]

  return job_configuration
}

function jupyterJobInfo(identifier: JobIdentifer, job_manager: JobManager) : ValidatedOutput<JobInfo>
{
  const failure_output:JobInfo = {id: "", image: "", names: [], command: "", status: "", state: "dead", stack: "", labels: {}, ports: []}
  const jupyter_job_name = JUPYTER_JOB_NAME(identifier)
  const job_info_request = job_manager.container_drivers.runner.jobInfo({
    'labels': { [label_strings.job.name]: [jupyter_job_name]},
    'states': ['running']
  })
  // -- return false if request fails ------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, failure_output)
  // -- return success if id exists --------------------------------------------
  return firstJob(job_info_request)
}

function jupyterJobId(identifier: JobIdentifer, job_manager: JobManager) : ValidatedOutput<string>
{
    const fetch_job = jupyterJobInfo(identifier, job_manager)
    if(fetch_job.success) return new ValidatedOutput(true, fetch_job.value.id)
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

function mapJupyterUrl(url: string, access_ip?:string) 
{
  if(access_ip)
    return url.replace(/(?<=http:\/\/)\d+\.\d+\.\d+\.\d+/, access_ip)
  return url
}

function toStandardJupyterIdentifier(job_manager: JobManager, job_identifer: JobIdentifer) : ValidatedOutput<undefined>
{
    const failure = new ValidatedOutput(false, undefined)
    const success = new ValidatedOutput(true, undefined)
    // ensure all job-ids are valid full-length ids
    if(job_identifer["job-id"]) {
        const fetch_id = firstJobId(job_manager.container_drivers.runner.jobInfo({
            'ids': [job_identifer["job-id"]],
            'states': ['running']
        }))
        if(!fetch_id.success) return failure.pushError(ErrorStrings.JOBS.NO_MATCHING_ID)
        job_identifer['job-id'] = fetch_id.value
    }
    return success
}
