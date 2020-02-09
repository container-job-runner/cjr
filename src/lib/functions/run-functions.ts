import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as inquirer from 'inquirer'
import * as chalk from 'chalk'
import {RunDriver} from '../drivers/abstract/run-driver'
import {BuildDriver} from '../drivers/abstract/build-driver'
import {Configuration} from '../config/abstract/configuration'
import {PathTools} from '../fileio/path-tools'
import {FileTools} from '../fileio/file-tools'
import {JSONFile} from '../fileio/json-file'
import {YMLFile} from '../fileio/yml-file'
import {ValidatedOutput} from '../validated-output'
import {printResultState} from './misc-functions'
import {ShellCommand} from '../shell-command'
import {DefaultContainerRoot, X11_POSIX_BIND, project_idfile, project_settings_folder, projectSettingsYMLPath, default_settings_object, job_info_label} from '../constants'
import {buildIfNonExistant} from '../functions/build-functions'
import {ErrorStrings, WarningStrings} from '../error-strings'
import {PodmanConfiguration} from '../config/podman/podman-configuration'
import {JSTools} from '../js-tools'
import {ps_vo_validator} from '../config/project-settings/project-settings-schema'

// -- types --------------------------------------------------------------------
type Dictionary = {[key: string]: any}

// -----------------------------------------------------------------------------
// FILTERJOBINFOBYID filters the output of RunDriver.jobInfo() and returns all
// jobs whose ID begins with the characters in the passed parameter "id"
// -- Parameters ---------------------------------------------------------------
// job_info: Array<Dictionary> - absolute path where cli was called from
// id: string - string for matching ids
// -- Returns ------------------------------------------------------------------
// ValidatedOutput - data contains array of Dictinary with matching job info
export function filterJobInfoByID(job_info: Array<Dictionary>, id: string)
{
  if(id.length < 1) return new ValidatedOutput(false, [], [ErrorStrings.JOBS.INVALID_ID])
  const regex = new RegExp(`^${id}`)
  const matching_jobs = job_info.filter((job:Dictionary) => regex.test(job.id))
  return (matching_jobs.length > 0) ?
    new ValidatedOutput(true, matching_jobs) :
    new ValidatedOutput(false, [], [ErrorStrings.JOBS.NO_MATCHING_ID])
}

// returns array of jobs info objects for all jobs whose id begins with the letters in the passed parameter "id"
export function matchingJobInfo(runner: RunDriver, id: string, stack_path: string, status:string = "")
{
  return filterJobInfoByID(runner.jobInfo(stack_path, status), id)
}

// returns array of jobs ids for all jobs whose id begins with the letters in the passed parameter "id"
export function matchingJobIds(runner: RunDriver, id: string, stack_path: string, status:string = "")
{
  const result = matchingJobInfo(runner, id, stack_path, status)
  if(result.success) result.data = result.data.map((x:Dictionary) => x.id)
  return result
}

// returns all running job ids
export function allJobIds(runner: RunDriver, stack_path: string="", status:string = "")
{
  return runner.jobInfo(stack_path, status).map((x:Dictionary) => x.id)
}

// determines if job with given name exists. Refactor with resultNameId
export function jobNameLabeltoID(runner: RunDriver, name: string, stack_path: string, status:string = "")
{
  const job_info = runner.jobInfo(stack_path, status)
  const index    = job_info.map((x:Dictionary) => x?.labels?.name).indexOf(name)
  return (index == -1) ? false : job_info[index].id
}

// -----------------------------------------------------------------------------
// CONTAINERWORKINGDIR determines the appropriate cwd for a container so that it
// replicates the feel of working on the local machine if the user is currently
// cd into the hostRoot folder.
// -- Parameters ---------------------------------------------------------------
// cli_cwd (string) - absolute path where cli was called from
// hRoot   (string) - absolite path of project root folder
// croot   (string) - absolute path where hroot is mounted on container
// -----------------------------------------------------------------------------
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
export function IfBuiltAndLoaded(builder: BuildDriver, build_mode: string, flags: Dictionary, stack_path: string, overloaded_config_paths: Array<string>, onSuccess: (configuration: Configuration, containerRoot: string, hostRoot: string) => void)
{
  var result = new ValidatedOutput(false, [], ['Internal Error - Invalid Build Mode'])
  if(build_mode === "no-rebuild")
    result = buildIfNonExistant(builder, stack_path, overloaded_config_paths)
  else if(build_mode == "build")
    result = builder.build(stack_path, overloaded_config_paths)
  else if(build_mode == "build-nocache")
    result = builder.build(stack_path, overloaded_config_paths, true)

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
      const shell = new ShellCommand(explicit, false)
      shell.output("xhost +localhost", {}, []);
      break;
    case "linux": // == LINUX ==================================================
      configuration.addBind(X11_POSIX_BIND, X11_POSIX_BIND)
      configuration.addRunEnvironmentVariable("DISPLAY", `$DISPLAY`)
  }

  // -- add special flags for podman -------------------------------------------
  if(configuration instanceof PodmanConfiguration) {
    configuration.addFlag("network", "host") // allows reuse of DISPLAY variable from host
    configuration.addFlag("security-opt", "label=disable") // allows /tmp/X11 directory to be accesible in container
  }
}


// -----------------------------------------------------------------------------
// addJobInfo adds label with JSON for job data
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// job_object: dictionary - a job object
// -----------------------------------------------------------------------------
export function addJobInfoLabel(configuration: Configuration, job_object: Dictionary)
{
  configuration.addLabel(job_info_label,
    JSON.stringify(
      JSTools.oSubset(job_object, ['hostRoot', 'containerRoot', 'resultPaths'])
    ))
}

// -----------------------------------------------------------------------------
// readJobInfoLabel parses json for jobinfo label
// -- Parameters ---------------------------------------------------------------
// job_info: Array<Dictionary> - result (possibly filtered) returned by runner.jobInfo
// -----------------------------------------------------------------------------
export function readJobInfoLabel(job: Dictionary)
{
  try
  {
    return JSON.parse(job?.labels?.[job_info_label])
  }
  catch (e)
  {
    return {}
  }
}

// -----------------------------------------------------------------------------
// readJobInfoLabel parses json for jobinfo label
// -- Parameters ---------------------------------------------------------------
// job_info: Array<Dictionary> - result (possibly filtered) returned by runner.jobInfo
// -----------------------------------------------------------------------------
export function validJobInfoLabel(job: Dictionary)
{
  try
  {
    return new ValidatedOutput(true, JSON.parse(job?.labels?.jobinfo))
  }
  catch (e)
  {
    return new ValidatedOutput(false, [], [ErrorStrings.JOBINFOLABEL.INVALIDJSON])
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
  if(!interactive || response?.flag == true) runner.jobToImage(job_id, image_name)
  if(remove_job) runner.jobDelete([job_id])
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
  const shell = new ShellCommand(explicit, false)
  const shell_result = shell.output("xauth list $DISPLAY", {}, [])
  if(shell_result.success) {
    const secret = shell_result.data.split("  ").pop(); // assume format: HOST  ACCESS-CONTROL  SECRET
    const script = ['cd', 'touch ~/.Xauthority', `xauth add $DISPLAY . ${secret}`, command].join(" && ")
    return ShellCommand.bashEscape(`bash -c ${ShellCommand.bashEscape(script)}`)
  }
  return command
}

// -----------------------------------------------------------------------------
// LOADPROJECTSETTINGS: loads any project settings from the cjr dir in hostRoot
// -- Parameters ---------------------------------------------------------------
// hostRoot: string - project hostRoot
// -- Returns ------------------------------------------------------------------
// settings: Dictinary - yml specified in project settings yml. The Object must
//                       pass validation described in project-settings schema.
// -----------------------------------------------------------------------------
export function loadProjectSettings(hostRoot: string)
{
  // -- exit if no hostRoot is specified ---------------------------------------
  if(!hostRoot) return new ValidatedOutput(true, {});

  // -- exit if no settings file exists ----------------------------------------
  const yml_path = projectSettingsYMLPath(hostRoot)
  if(!FileTools.existsFile(yml_path)) return new ValidatedOutput(true, {});

  // -- exit if settings file is invalid ---------------------------------------
  const stack_file = new YMLFile("", false, ps_vo_validator)
  const read_result = stack_file.validatedRead(yml_path)
  if(read_result.success == false) {
    return new ValidatedOutput(false, [], [], [WarningStrings.PROJECTSETTINGS.INVALID_YML(yml_path)])
  }

  //  -- set project settings variable -----------------------------------------
  const project_settings = { ...default_settings_object, ...read_result.data}
  PSStackToAbsPath(project_settings, hostRoot)
  return PSConfigFilesToAbsPath(project_settings, hostRoot)
}

// -- HELPER: ensures project-settings stack path is absolute --------------------------
function PSStackToAbsPath(project_settings: Dictionary, hostRoot: string)
{
  if(project_settings?.stack) { // if local stack folder exists. If so set path to absolute
    const yml_path = projectSettingsYMLPath(hostRoot)
    const abs_path = path.join(path.dirname(yml_path), project_settings.stack)
    if(FileTools.existsDir(abs_path)) project_settings.stack = abs_path
  }
}

// -- HELPER: ensures overwriting project-config files exist and have absolute paths ---
function PSConfigFilesToAbsPath(project_settings: Dictionary, hostRoot: string)
{
  const result = new ValidatedOutput(true, project_settings)
  if(project_settings?.configFiles) {
    const yml_path = projectSettingsYMLPath(hostRoot)
    // adjust relative paths
    project_settings.configFiles = project_settings.configFiles.map(
     (path_str:string) => (path.isAbsolute(path_str)) ? path_str : path.join(path.dirname(yml_path), path_str)
    )
    // remove nonexistant configuration files
    project_settings.configFiles = project_settings.configFiles.filter((path_str:string) => {
     let config_exists = FileTools.existsFile(path_str)
     if(!config_exists) result.pushWarning(WarningStrings.PROJECTSETTINGS.MISSING_CONFIG_FILE(yml_path, path_str))
     return config_exists
    })
  }
  return result
}

// -- Interactive Functions ----------------------------------------------------

export async function promptUserForJobId(runner: RunDriver, stack_path: string, status:string="", silent: boolean = false)
{
  if(silent) return false;
  const job_info = runner.jobInfo(stack_path, status)
  return await promptUserId(job_info);
}

// helper function for promptUserForJobId & promptUserForResultId
export async function promptUserId(id_info: Array<Dictionary>)
{
  const response = await inquirer.prompt([{
  name: 'id',
  message: 'Select an id:',
  prefix: "\b",
  suffix: "",
  type: 'list',
  pageSize: Math.min(id_info.length + 1, 30),
  choices: id_info.map((j:Dictionary) => {
    return {
      name: chalk`{italic ID}: ${JSTools.clipAndPad(j.id, 12, 15, true)} {italic COMMAND}: ${JSTools.clipAndPad(j.command, 20, 25, false)} {italic STATUS}: ${j.statusString}`,
      value: j.id
    }
  }).concat({name: "Exit", value: ""}),
}])
return response.id;
}

// -- ID Functions -------------------------------------------------------------

// -----------------------------------------------------------------------------
// ENSUREPROJECTID: ensures that there is a file in the project_settings_folder
// that contains the project id.
// -- Parameters ---------------------------------------------------------------
// hostRoot  - project host root
// -----------------------------------------------------------------------------

export function ensureProjectId(hostRoot: string)
{
  var result = getProjectId(hostRoot)
  if(result.success) return result
  const proj_settings_abspath = path.join(hostRoot, project_settings_folder)
  const file = new JSONFile(proj_settings_abspath, true)
  const id = `${path.basename(hostRoot)}-${new Date().getTime()}`
  file.write(project_idfile, id)
  return getProjectId(hostRoot)
}

// -----------------------------------------------------------------------------
// ENSUREPROJECTID: returns ValidatdOutput that contains projectId
// -- Parameters ---------------------------------------------------------------
// hostRoot  - project host root
// -----------------------------------------------------------------------------

export function getProjectId(hostRoot: string)
{
  const proj_settings_abspath = path.join(hostRoot, project_settings_folder)
  const file = new JSONFile(proj_settings_abspath, false)
  const result = file.read(project_idfile)
  if(result.success && result.data == "") // -- check if data is empty -----
    return new ValidatedOutput(false, [], [
      ErrorStrings.PROJECTIDFILE.EMPTY(path.join(proj_settings_abspath, project_idfile))
    ])
  return result
}

// -----------------------------------------------------------------------------
// PRINTTABLE: prints a formatted table_parameters with title, header.
// -- Parameters ---------------------------------------------------------------
// configuration (Object) with fields:
//    column_widths    (nx1 Array<number>)   - width of each column (in spaces)
//    text_widths      (nx1 Array<string>)   - max width of text for each column. must satisfy text_widths[i] <= column_widths[i]
//    silent_clip      (nx1 Array<boolean>)  - if silent_clip[i] == false, then any shortened text will end with "..."
//    title            (String)              - title of table
//    header:          (nx1 Array<string>)   - name of each column
// -----------------------------------------------------------------------------
export function printVerticalTable(configuration: Dictionary)
{

  // -- read data into local variables for convenience -------------------------
  const c_widths = configuration.column_widths
  const t_widths = configuration.text_widths
  const s_clip   = configuration.silent_clip
  const title    = configuration.title
  const c_header = configuration.column_headers

  // -- helper function for printing a table row -------------------------------
  const printRow = (row: Array<string>) => {
    console.log(
      row.map(
        (s:string, index:number) => JSTools.clipAndPad(s, t_widths[index], c_widths[index], s_clip[index])
      ).join("")
    )
  }

  // -- print title ------------------------------------------------------------
  if(title) {
    const width = c_widths.reduce((total:number, current:number) => total + current, 0)
    console.log(chalk`-- {bold ${title}} ${"-".repeat(width - title.length - 4)}`)
  }
  // -- print header -----------------------------------------------------------
  if(c_header) printRow(c_header)
  // -- print data -------------------------------------------------------------
  configuration.data.map((row: Array<string>) => printRow(row))
}

export function printHorizontalTable(configuration: Dictionary)
{

  // -- read data into local variables for convenience -------------------------
  const c_widths  = configuration.column_widths // should be of length 2
  const t_widths  = configuration.text_widths   // should be of length 2
  const title     = configuration.title
  const r_headers = configuration.row_headers

  // -- helper function for printing a table row -------------------------------
  const printItem = (row: Array<string>, data_index: number) => {
    for(var header_index = 0; header_index < row.length; header_index ++) {
      const content:Array<string> = JSTools.lineSplit(row[header_index], t_widths[1]) // split data into lines
        content.map((line:string, line_index:number) => {
          const header = (line_index == 0) ? r_headers[header_index] : "" // header only prints on first line
          console.log( // print header + data
            JSTools.clipAndPad(header, t_widths[0], c_widths[0], true) +
            JSTools.clipAndPad(line, t_widths[1], c_widths[1], true)
          )
        })
      }
      if(data_index != configuration.data.length - 1) console.log()
  }

  // -- print title ------------------------------------------------------------
  if(title) {
    const width = c_widths.reduce((total:number, current:number) => total + current, 0)
    console.log(chalk`-- {bold ${title}} ${"-".repeat(width - title.length - 4)}`)
  }
  // -- print data -------------------------------------------------------------
  configuration.data.map((item: Array<string>, index: number) => printItem(item, index))
}
