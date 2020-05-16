import * as path from 'path'
import * as os from 'os'
import { ShellCommand } from '../shell-command'
import { ErrorStrings } from '../error-strings'
import { ValidatedOutput } from '../validated-output'
import { THEIA_JOB_NAME, name_label, Dictionary } from '../constants'
import { parseJSON } from './misc-functions'
import { RunDriver, firstJobId } from '../drivers-containers/abstract/run-driver'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobDriver, ContainerDrivers, Configurations, OutputOptions } from '../drivers-jobs/job-driver'

export type TheiaOptions = {
  "stack_configuration": StackConfiguration<any> // stack configuration in which jupyter will be run
  "port": {hostPort: number, containerPort: number, address?: string} // port configuration for running jupyter
  "project-root"?: string     // host project root
  "reuse-image"?: boolean     // specifies if image should be reused if already build
  "args"?: Array<string>      // additional args for jupyter command
  "x11"?: boolean             // optional x11 command
}

const ENV = {
  url:  'THEIA_URL',
  port: 'THEIA_PORT'
}

// === Core functions ==========================================================

export function startTheiaInProject(job_driver: JobDriver, container_drivers: ContainerDrivers, configurations: Configurations, output_options: OutputOptions, theia_options: TheiaOptions) : ValidatedOutput<string>
{
  const theia_job_name = THEIA_JOB_NAME({"project-root" : theia_options['project-root'] || ""})
  const job_info_request = container_drivers.runner.jobInfo({
    'labels': { [name_label] : [theia_job_name] },
    'states': ['running']
  })
  // -- exit if request fails --------------------------------------------------
  if(!job_info_request.success)
    return new ValidatedOutput(false, "")
  const theia_job_id = firstJobId(job_info_request).value
  if(theia_job_id !== "")
    return (new ValidatedOutput(true, theia_job_id)).pushWarning(ErrorStrings.THEIA.RUNNING(theia_job_id, theia_options['project-root'] || ""))
  // -- add port to jupyter stack ----------------------------------------------
  const stack_configuration = theia_options["stack_configuration"]
  stack_configuration.addPort(theia_options['port'].hostPort, theia_options['port'].containerPort, theia_options['port'].address)
  setEnvironment(stack_configuration, theia_options)
  //stack_configuration.setEntrypoint(["/bin/sh", "-c"])
  // -- create new jupyter job -------------------------------------------------
  const job_configuration = configurations.job(stack_configuration)
  job_configuration.addLabel(name_label, theia_job_name)
  job_configuration.remove_on_exit = true
  job_configuration.synchronous = false
  job_configuration.command = [theiaCommand(stack_configuration, theia_options)]
  // -- start jupyter job -------------------------------------------------------
  const job = job_driver.run(
    job_configuration,
    container_drivers,
    configurations,
    output_options,
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

// -- extract the url for a theia notebook  ------------------------------------
export function stopTheia(drivers: ContainerDrivers, identifier: {"project-root"?: string}) : ValidatedOutput<undefined>
{
  const job_info_request = firstJobId(
    drivers.runner.jobInfo({
      'labels': { [name_label]: [THEIA_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const theia_job_id = job_info_request.value
  if(theia_job_id == "")
    return (new ValidatedOutput(false, undefined)).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  else
    return drivers.runner.jobStop([theia_job_id])
}

// -- extract the url for a theia server  --------------------------------------
export async function getTheiaUrl(drivers: ContainerDrivers, configurations: Configurations, identifier: {"project-root"?: string}) : Promise<ValidatedOutput<string>>
{
  const job_info_request = firstJobId(
    drivers.runner.jobInfo({
      'labels': { [name_label]: [THEIA_JOB_NAME(identifier)]},
      'states': ['running']
    })
  )
  const theia_job_id = job_info_request.value
  if(theia_job_id == "")
    return (new ValidatedOutput(false, "")).pushError(ErrorStrings.THEIA.NOT_RUNNING(identifier['project-root'] || ""))
  const exec_configuration = configurations.exec()
  exec_configuration.command = ['bash', '-c', `echo '{"url":"'$${ENV.url}'","port":"'$${ENV.port}'"}'`]
  const exec_output = drivers.runner.jobExec(theia_job_id, exec_configuration, "pipe")
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
function theiaCommand(stack_configuration: StackConfiguration<any>, theia_options: TheiaOptions) {
  const container_root = stack_configuration.getContainerRoot()
  const project_dir = (container_root && theia_options['project-root']) ? path.posix.join(container_root, path.basename(theia_options['project-root'])) : container_root
  return `theia --hostname $${ENV.url} --port $${ENV.port} ${project_dir}`;
}

// -- environment variables for THEIA ------------------------------------------
function setEnvironment(stack_configuration: StackConfiguration<any>, theia_options: TheiaOptions) {
  const env:Dictionary = {}
  env[ENV.port] = `${theia_options['port'].containerPort}`;
  env[ENV.url]  = '0.0.0.0'
  return env;
}
