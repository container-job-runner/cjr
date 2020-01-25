import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {RunDriver} from '../drivers/abstract/run-driver'
import {BuildDriver} from '../drivers/abstract/build-driver'
import {Configuration} from '../config/abstract/configuration'
import {PathTools} from '../fileio/path-tools'
import {FileTools} from '../fileio/file-tools'
import {JSONFile} from '../fileio/json-file'
import {ValidatedOutput} from '../validated-output'
import {printResultState} from './misc-functions'
import {ShellCMD} from '../shellcmd'
import {DefaultContainerRoot, X11_POSIX_BIND} from '../constants'
import {buildIfNonExistant} from '../functions/build-functions'
import {ErrorStrings, WarningStrings} from '../error-strings'
import {PodmanConfiguration} from '../config/podman/podman-configuration'
import * as inquirer from 'inquirer'
import * as chalk from 'chalk'

// -- types --------------------------------------------------------------------
type Dictionary = {[key: string]: any}

function matchingIds(job_ids: Array<string>, stack_path: string, id: string, all:boolean = false)
{
  if(!all && id.length < 1) return new ValidatedOutput(false, [], [ErrorStrings.JOBS.INVALID_ID])
  // find current jobs matching at least part of ID
  const re = new RegExp(`^${id}`)
  const matching_ids = (all) ? job_ids : job_ids.filter((id:string) => re.test(id))
  return (matching_ids.length > 0 || id.length == 0) ?
    new ValidatedOutput(true, matching_ids) :
    new ValidatedOutput(false, [], [ErrorStrings.JOBS.NO_MATCHING_ID])
}

export function matchingJobIds(runner: RunDriver, stack_path: string, id: string, all:boolean = false)
{
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  return matchingIds(runner.jobInfo(image_name).map((x:Dictionary) => x.id), stack_path, id, all)
}

export function matchingResultIds(runner: RunDriver, stack_path: string, id: string, all:boolean = false)
{
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  return matchingIds(runner.resultInfo(image_name).map((x:Dictionary) => x.id), stack_path, id, all)
}

// determines if job with given name exists. Refactor with resultNameId
export function jobNametoID(runner: RunDriver, stack_path: string, name: string)
{
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  const job_info   = runner.jobInfo(image_name)
  const index      = job_info.map((x:Dictionary) => x.names).indexOf(name)
  return (index == -1) ? false : job_info[index].id
}

// determines if result with given name exists
export function resultNametoID(runner: RunDriver, stack_path: string, name: string)
{
  const image_name  = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  const result_info = runner.resultInfo(image_name)
  const index       = result_info.map((x:Dictionary) => x.names).indexOf(name)
  return (index == -1) ? false : result_info[index].id
}

// Get Working for container given CLI Path, hostRoot and Container ROot
export function containerWorkingDir(cli_cwd:string, hroot: string, croot: string)
{
  const hroot_arr:Array<string> = PathTools.split(hroot)
  const rel_path = PathTools.relativePathFromParent(hroot_arr, PathTools.split(cli_cwd))
  return (rel_path === false) ? false : [croot.replace(/\/$/, "")].concat(hroot_arr.pop() || "", rel_path).join("/")
}

// -----------------------------------------------------------------------------
// IFBUILDANDLOADED Calls function onSuccess if stack is build and successuffly
//  loaded. The following arguments are passed to onSuccess
//    1. configuration (Configuration) - the stack Configuration
//    2. containerRoot - the container project root folder
//    3. hostRoot (String | false) - the project hostRoot or false if non existsSync
// -- Parameters ---------------------------------------------------------------
// builder  - (BuildDriver) Object that inherits from abstract class Configuration
// flags    - (Object) command flags. The only optional propertes will affect this function are:
//              1. containerRoot
//              2. hostRoot
// stack_path - absolute path to stack folder
// overloaded_config_paths - absolute paths to any overloading configuration files
// -----------------------------------------------------------------------------
export function IfBuiltAndLoaded(builder: BuildDriver, flags: Dictionary, stack_path: string, overloaded_config_paths: Array<string>, onSuccess: (configuration: Configuration, containerRoot: string, hostRoot: string) => void)
{
  var result = buildIfNonExistant(builder, stack_path, overloaded_config_paths)
  if(result.success) // -- check that image was built
  {
    result = builder.loadConfiguration(stack_path, overloaded_config_paths)
    if(result.success) // -- check that configuration passed builder requirments
    {
      const configuration = result.data
      const containerRoot = [flags?.containerRoot, configuration.getContainerRoot()]
        .concat(DefaultContainerRoot)
        .reduce((x,y) => x || y)
      const hostRoot = [flags?.hostRoot, configuration.getHostRoot()]
        .concat(false)
        .reduce((x,y) => x || y)
      const output:any = onSuccess(configuration, containerRoot, hostRoot)
      if(output instanceof ValidatedOutput) result = output
    }
  }
  return result
}

// -----------------------------------------------------------------------------
// ADDPORTS adds ports to a configuration as specified by a cli flag.
// This function is used by the shell and $ commands.
// -- Parameters ---------------------------------------------------------------
// configuration  - Object that inherits from abstract class Configuration
// ports          - cli flag value whith specification:
//                  flags.string({default: [], multiple: true})
// -----------------------------------------------------------------------------
export function addPorts(configuration: Configuration, ports: Array<string>)
{
  var regex_a = RegExp(/^\d+:\d+$/) // flag format: --port=hostPort:containerPort
  var regex_b = RegExp(/^\d+$/)     // flag format: --port=port
  ports?.map(port_string => {
    if(regex_a.test(port_string)) {
      let p = port_string.split(':').map((e:string) => parseInt(e))
      configuration.addPort(p[0], p[1])
    }
    else if(regex_b.test(port_string)) {
      let p = parseInt(port_string)
      configuration.addPort(p, p)
    }
  })
}

// -----------------------------------------------------------------------------
// SETRELATIVEWORKDIR alters the working dir of a configuration iff hostDir is a
// child of hostRoot. Let hostPath be a child of hostRoot, and let X be the
// relative path from hostRoot to hostDir. This functions sets these working dir
// of the container to path.join(containerRoot, X)
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// hostRoot      - Project root folder
// containerRoot - Container root folder
// hostDir       - user directory (defaults to process.cwd())
// -----------------------------------------------------------------------------
export function setRelativeWorkDir(configuration: Configuration, containerRoot: string, hostRoot: string, hostDir: string = process.cwd())
{
  if(hostRoot) {
    const ced = containerWorkingDir(process.cwd(), hostRoot, containerRoot)
    if(ced) configuration.setWorkingDir(ced)
  }
}

// -----------------------------------------------------------------------------
// BINDHOSTROOT adds a mount with type bind to a configuration that maps
// hostRoot (on host) to containerRoot (on container)
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// hostRoot      - Project root folder
// containerRoot - Container root folder
// -----------------------------------------------------------------------------
export function bindHostRoot(configuration: Configuration, containerRoot: string, hostRoot: string)
{
  if(hostRoot) {
    const hostRoot_basename = path.basename(hostRoot)
    configuration.addBind(hostRoot, path.posix.join(containerRoot, hostRoot_basename))
  }
}

// -----------------------------------------------------------------------------
// WRITEJSONJobFIle write a JSON file that contains job information (job_object)
// -- Parameters ---------------------------------------------------------------
// writer       (JSONFile) - JSONFILE object for writing to disk
// result       (ValidatedOutput) - result from runner.createJob that contains ID
// job_object   (Object) - job data
// -----------------------------------------------------------------------------
export function writeJSONJobFile(file_writer: JSONFile, result: ValidatedOutput, job_object: object)
{
  if(result.success) {
    const job_id = result.data
    file_writer.write(job_id, job_object)
  }
}

// -----------------------------------------------------------------------------
// JOBTOIMAGE creates an image from a running or completed job. If image_name is
// blank it will overwrite stack image
// -- Parameters ---------------------------------------------------------------
// runner       (RunDriver) - JSONFILE object for writing to disk
// result       (ValidatedOutput) - result from runner.createJob that contains ID
// image_name   (string) - name of new imageName
// stack_path   (string) - name of container stack
// remove_job   (boolean) - if true job is removed on exit
// -----------------------------------------------------------------------------
export async function jobToImage(runner: RunDriver, result: ValidatedOutput, image_name: string, remove_job: boolean = false, interactive: boolean = false)
{
  if(result.success === false) return;
  const job_id = result.data
  var response: Dictionary = {}
  if(interactive) {
    response = await inquirer.prompt([
      {
        name: "flag",
        message: `Save container to image "${image_name}"?`,
        type: "confirm",
      }
    ])
  }
  if(!interactive || response?.flag == true) runner.toImage(job_id, image_name)
  if(remove_job) runner.resultDelete([job_id])
}

// -----------------------------------------------------------------------------
// ENABLEX11: bind X11 directoru and sets environment variable DISPLAY in container.
// -- Parameters ---------------------------------------------------------------
// configuration  - Object that inherits from abstract class Configuration
// -----------------------------------------------------------------------------
export function enableX11(configuration: Configuration, explicit:boolean = false)
{
  const platform = os.platform()

  if(["linux", "darwin"].includes(platform) == false) { // -- unsupported OS ---
    return printResultState(
      new ValidatedOutput(true, [], [], [WarningStrings.X11.FLAGUNAVALIABLE])
    )
  }

  if(!FileTools.existsDir(X11_POSIX_BIND)) { // -- nonexistant X11 folder ------
    return printResultState(
      new ValidatedOutput(true, [], [], [WarningStrings.X11.MISSINGDIR(X11_POSIX_BIND)])
    )
  }

  switch(platform)
  {
    case "darwin": // == MAC ===================================================
      const sockets = fs.readdirSync(X11_POSIX_BIND)?.filter(file_name => new RegExp(/^X\d+$/)?.test(file_name))?.sort();
      if(sockets.length < 1) { // -- no sockets --------------------------------
        return printResultState(
          new ValidatedOutput(true, [], [], [WarningStrings.X11.MACMISSINGSOCKET(X11_POSIX_BIND)])
        )
      }
      const socket_number:string = sockets.pop()?.replace("X", "") || "0" // select socket with highest number - this is useful since an xQuartx chrach will leave behind a non functional socket
      configuration.addBind(X11_POSIX_BIND, X11_POSIX_BIND)
      configuration.addRunEnvironmentVariable("DISPLAY", `host.docker.internal:${socket_number}`)
      const shell = new ShellCMD(explicit, false)
      shell.output("xhost +localhost", {}, []);
      break;
    case "linux": // == LINUX ==================================================
      configuration.addBind(X11_POSIX_BIND, X11_POSIX_BIND)
      configuration.addRunEnvironmentVariable("DISPLAY", `$DISPLAY`)
  }

  // -- add special flags for podman -------------------------------------------
  if(configuration instanceof PodmanConfiguration) {
    configuration.setFlag("network", "host") // allows reuse of DISPLAY variable from host
    configuration.setFlag("security-opt", "label=disable") // allows /tmp/X11 directory to be accesible in container
  }
}

// -----------------------------------------------------------------------------
// PREPENDXAUTH: prepend commands to add xAuth from host into container, onto
// any existing command.
// -- Parameters ---------------------------------------------------------------
// command  - existing command string
// explicit: boolean - determines if commands run on host are to be printed
// -----------------------------------------------------------------------------
export function prependXAuth(command: string, explicit: boolean = false)
{
  if(os.platform() != "linux") return ""
  const shell = new ShellCMD(explicit, false)
  const shell_result = shell.output("xauth list $DISPLAY", {}, [])
  if(shell_result.success) {
    const secret = shell_result.data.split("  ").pop(); // assume format: HOST  ACCESS-CONTROL  SECRET
    const script = ['cd', 'touch ~/.Xauthority', `xauth add $DISPLAY . ${secret}`, command.replace(/"/g, '\\"')].join("\n")
    return `bash -c "${script}"`
  }
  return ""
}

// -----------------------------------------------------------------------------
// ADDXAUTHSECRET: execs commands in container which add xAuth secret from host
// -- Parameters ---------------------------------------------------------------
// runner  - RunDriver
// result: ValidatedOutput - result from jobStart
// explicit: boolean - determine if shell commands are printed
// -----------------------------------------------------------------------------
// export function addXAuthSecret(runner: RunDriver, result: ValidatedOutput, explicit: boolean = false)
// {
//   if(result.success == false) return
//   if(os.platform() != "linux") return
//   const id = result.data
//   const shell = new ShellCMD(explicit)
//   const shell_result = shell.output("xauth list $DISPLAY", {}, [])
//   if(shell_result.success) {
//     const secret = shell_result.data.split("  ").pop(); // assume format: HOST  ACCESS-CONTROL  SECRET
//     const script = ['cd', 'touch ~/.Xauthority', `xauth add $DISPLAY . ${secret}`].join("\n")
//     const command = `bash -c "${script}"`
//     runner.jobExec(id, command, {})
//   }
// }

// -- Interactive Functions ----------------------------------------------------

export async function promptUserForJobId(runner: RunDriver, stack_path: string, silent: boolean = false)
{
  if(silent) return false;
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  const job_info = runner.jobInfo(image_name)
  return await promptUserId(job_info);
}

export async function promptUserForResultId(runner: RunDriver, stack_path: string, silent: boolean = false)
{
  if(silent) return false;
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  const result_info = runner.resultInfo(image_name)
  return await promptUserId(result_info);
}

// helper function for promptUserForJobId & promptUserForResultId
async function promptUserId(id_info: Array<Dictionary>)
{
  const short_cmd_str = (cmd_str:string) => (cmd_str.length > 10) ? `${cmd_str.substring(0,10)}...` : cmd_str
  const response = await inquirer.prompt([{
  name: 'id',
  message: 'Select an id:',
  prefix: "\b",
  suffix: "",
  type: 'rawlist',
  choices: id_info.map((j:Dictionary) => {
    return {
      name: chalk`{italic ID}: ${j.id.substring(0, 12)} {italic COMMAND}: ${short_cmd_str(j.command)} {italic STATUS}: ${j.status}`,
      value: j.id
    }
  }).concat({name: "Exit", value: ""}),
}])
return response.id;
}
