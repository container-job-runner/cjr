import inquirer = require('inquirer')
import chalk = require('chalk')
import path = require('path')
import os = require('os')
import fs = require('fs-extra')
import constants = require('../constants')

import { JobState, JobInfo, JobPortInfo} from '../drivers-containers/abstract/run-driver'
import { ContainerDrivers, Configurations, JobManager, JobProperties } from '../job-managers/abstract/job-manager'
import { Dictionary, projectSettingsDirPath, projectSettingsYMLPath, stack_bundle_rsync_file_paths } from '../constants'
import { JSTools } from '../js-tools'
import { ValidatedOutput } from '../validated-output'
import { ErrorStrings, WarningStrings, StatusStrings } from '../error-strings'
import { JSONFile } from '../fileio/json-file'
import { ProjectSettings } from '../config/project-settings/project-settings'
import { printValidatedOutput, trim } from './misc-functions'
import { ShellCommand } from '../shell-command'
import { FileTools } from '../fileio/file-tools'
import { ChildProcess } from 'child_process'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { DockerStackConfiguration, DockerRegistryAuthConfig, DockerRegistryStackSnapshotOptions } from '../config/stacks/docker/docker-stack-configuration'

// == TYPES ====================================================================

// -- used by function bundleProject and bundleProjectSettings
export type ProjectBundleOptions =
{
  "project-root": string,
  "stack-path":   string,
  "config-files": Array<string>,
  "bundle-path":  string
  "verbose"?:     boolean
}

// -- used by function bundleStack
export type StackBundleOptions =
{
  "stack-path":           string              // absolute path to stack that should be bundled
  "config-files":         Array<string>,
  "bundle-path":          string,
  "config-files-only"?:   boolean, // if selected only configuration files are bundled
  "verbose"?:             boolean
}

export function bundleProject(configurations: Configurations, options: ProjectBundleOptions)
{
  const settings_dir = constants.projectSettingsDirPath(options["bundle-path"])   // directory that stores project settings yml & stack
  // -- ensure directory structure ---------------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.COPYING_FILES, options?.verbose || false)
  fs.copySync(options["project-root"], options["bundle-path"])
  fs.removeSync(settings_dir) // remove any existing settings
  // -- bundle project settings ------------------------------------------------
  const ps_options:ProjectBundleOptions = { ... options, ... { 'bundle-path': settings_dir } }
  return bundleProjectSettings(configurations, ps_options)
}

export function bundleProjectSettings(configurations: Configurations, options: ProjectBundleOptions) : ValidatedOutput<undefined>
{
    printStatusHeader(StatusStrings.BUNDLE.PROJECT_SETTINGS, options?.verbose || false)
    const result = new ValidatedOutput(true, undefined)
    const load_result = loadProjectSettings(options["project-root"])
    if(!load_result.success) return new ValidatedOutput(false, undefined).absorb(load_result)
    
    const project_settings = load_result.value;
    const stack_name = path.basename(options["stack-path"])

    // -- create project-settings for bundle -----------------------------------
    const bundle_project_settings = new ProjectSettings()  
    bundle_project_settings.setProjectRoot('auto')
    bundle_project_settings.setStacksDir(
        constants.project_settings.subdirectories.stacks
    )  
    bundle_project_settings.setStack(
        path.join(
            constants.project_settings.subdirectories.stacks,
            stack_name
        )
    )
    bundle_project_settings.setDefaultProfiles(
        bundleDefaultProfiles(
            project_settings, 
            options['stack-path'], 
            bundle_project_settings.getStack() || ""
        )
    )

    // -- populate project settings directory ----------------------------------
    // 1. copy profile
    if(fs.existsSync(constants.projectSettingsProfilePath(options["project-root"])))
        fs.copySync(
            constants.projectSettingsProfilePath(options["project-root"]),
            path.join(options['bundle-path'], constants.project_settings.subdirectories.profiles)
        )
    // 2. create project-settings files
    bundle_project_settings.writeToFile(
        path.join(
            options["bundle-path"], 
            constants.project_settings.filenames["project-settings"]
        )
    )
    // 3. copy stack
    const bundle_stacks_dir = path.join(options["bundle-path"], 'stacks')
    fs.ensureDirSync(bundle_stacks_dir)
    result.absorb(
        bundleStack(configurations, {
            "stack-path":   options['stack-path'],
            "config-files": options["config-files"],
            "bundle-path":  path.join(bundle_stacks_dir, stack_name),
            "verbose":      options.verbose || false
        })
    )

    return result
}

export function bundleStack(configurations: Configurations, options: StackBundleOptions) : ValidatedOutput<StackConfiguration<any>>
{
  // -- ensure that stack can be loaded ----------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.STACK_BUILD(options['stack-path']), options?.verbose || false)
  const stack_configuration = configurations.stack()
  if(FileTools.existsDir(options['stack-path'])) { // assume local stack
    const load_result = stack_configuration.load(options['stack-path'], options["config-files"])
    if(!load_result.success) load_result
  } 
  else { // assume remote stack
    stack_configuration.setImage(options['stack-path'])
    const load_result = stack_configuration.mergeConfigurations(options["config-files"])
    if(!load_result.success) load_result
  }

  // -- prepare configuration for bundling -------------------------------------
  const copy_ops:Array<{source: string, destination: string}> = []
  const rsync_settings = {
    upload: stack_configuration.getRsyncUploadSettings(true),
    download: stack_configuration.getRsyncDownloadSettings(true)
  }
  // --> 1. remove binds
  const reb_result = stack_configuration.removeExternalBinds(options["stack-path"])
  printValidatedOutput(reb_result) // print any warnings
  // --> 2. adjust rsync file paths
  const bundleRsyncFile = (direction:"upload"|"download", file:"include"|"exclude") => {
    if(rsync_settings?.[direction]?.[file] && FileTools.existsFile(rsync_settings?.[direction]?.[file] || "")) {
      const new_file_path = stack_bundle_rsync_file_paths[direction][file]
      copy_ops.push({
        source: rsync_settings[direction][file],
        destination: path.join(options["bundle-path"], new_file_path)
      })
      rsync_settings[direction][file] = new_file_path
    }
  }
  let ds: Array<"upload"|"download"> = ["upload", "download"]
  let ft: Array<"include"|"exclude"> = ["include", "exclude"]
  for (const direction of ds) {
    for (const file of ft) {
      bundleRsyncFile(direction, file)
    }
  }
  stack_configuration.setRsyncUploadSettings(rsync_settings.upload)
  stack_configuration.setRsyncDownloadSettings(rsync_settings.download)
  // --> 3. copy stack
  fs.ensureDirSync(options["bundle-path"]) // create folder
  if(!options?.['config-files-only']) // copy stack contents
    try { fs.copySync(options["stack-path"], options["bundle-path"]) }
    catch (e) { return new ValidatedOutput(false, e, [e?.message]) }
  stack_configuration.save(options["bundle-path"]) // save configuration files
  // --> 4. copy additional files
  copy_ops.map((e:{source:string, destination:string}) =>
    fs.copySync(e.source, e.destination, {preserveTimestamps: true}))
  return new ValidatedOutput(true, stack_configuration)
}

function bundleDefaultProfiles(project_settings: ProjectSettings, host_stack_path: string, bundle_stack_path: string) : { [key: string] : string[] }
{
    const default_profiles = project_settings.getDefaultProfiles() || {}
    const bundle_default_profiles:{ [key: string] : string[] } = {}
    const patternsMatchHostStack = (accumulator: boolean, pattern: string) => accumulator || (new RegExp(`${pattern}$`).test(host_stack_path))

    // only keep profile rules that activate with current host stack
    const profiles = Object.keys(default_profiles);
    profiles.forEach( (p:string) => {
        if(default_profiles[p].includes(project_settings.profile_all_stacks_keyword)) // include if profile applies to all
            bundle_default_profiles[p] = [project_settings.profile_all_stacks_keyword]
        else if (default_profiles[p].reduce(patternsMatchHostStack, false)) // include if profile applies to all
            bundle_default_profiles[p] = [bundle_stack_path]
    });

  return bundle_default_profiles
}

// helper function user by startjob to print status
function printStatusHeader(message: string, verbose: boolean, line_width:number = 80) {
  if(verbose) console.log(chalk`-- {bold ${message}} ${'-'.repeat(Math.max(0,line_width - message.length - 4))}`)
}
function printStatusFooter(verbose: boolean, line_width:number = 80) {
  if(verbose) console.log('-'.repeat(Math.max(0,line_width)))
}

export function nextAvailablePort(job_manager: JobManager,  starting_port:number=1024) : number
{
    const request = getUsedPorts(job_manager, starting_port)
    if( ! request.success ) return starting_port

    const ord_ports = request.value
    // -- return next available port ---------------------------------------------
    for(var i = 0; i <= ord_ports.length; i ++)  {
        if(ord_ports[i] == starting_port) starting_port++ // port is already used. increment
        if(ord_ports[i] > starting_port) return starting_port //port is free
    }
    return starting_port
}

export function nextAvailablePorts(job_manager: JobManager, starting_port:number=1024, total_ports:number) : number[]
{
    const request = getUsedPorts(job_manager, starting_port)
    if( ! request.success ) 
        return new Array(total_ports)
            .fill(starting_port)
            .map( (value: number, index: number) => value + index)
    
    const ord_ports = request.value
    const free_ports:number[] = []
    // -- determine available ports --------------------------------------------
    for(var i = 0; i <= ord_ports.length; i ++)  {
        if(ord_ports[i] == starting_port) starting_port++ // port is already used, increment starting_port.
        if(ord_ports[i] > starting_port) // ports starting_port, ... , (ord_ports[i] - 1) are available
        { 
            const delta = Math.min(total_ports - free_ports.length, ord_ports[i] - starting_port) // number of ports to add
            free_ports.push( ... new Array(delta).fill(starting_port).map(
                (value: number, index: number) => value + index)
            )
            starting_port = starting_port + delta + 1
        } 
    }
    // -- add additional ports (if there are still not enough ports) -------
    const delta = total_ports - free_ports.length
    free_ports.push(
        ... (new Array(delta).fill(starting_port).map( (value: any, index: number) => value + index))
    )
    return free_ports
}

function getUsedPorts(job_manager : JobManager, starting_port:number=1024) : ValidatedOutput<number[]> {
    // -- get currently running jobs -------------------------------------------
    const job_info = job_manager.container_drivers.runner.jobInfo({states: ["running"]}) // get all jobs
    if(!job_info.success) return new ValidatedOutput(false, [])
    // -----> extract port and order ascending ---------------------------------
    const ports:Array<number> = []
    job_info.value.map( 
        (job_info:JobInfo) => ports.push(
            ... job_info.ports.map( (port_info:JobPortInfo) => port_info.hostPort )
        )
    )
    // ----> add cjr reserved ports ---------------------------------------------
    job_info.value.map(
        (job_info : JobInfo) => {
            try { ports.push( ... JSON.parse(job_info.labels[constants.label_strings.job["reserved-ports"]]) ) } catch { }
        }
    )

    // -- add system ports -----------------------------------------------------
    ports.push( ... FileTools.usedPorts(starting_port, job_manager.shell, 5000) )
    const ord_ports = [ ... new Set(ports) ].sort((a,b) => a - b)
    
    return new ValidatedOutput(true, ord_ports)
}

// -----------------------------------------------------------------------------
// INITX11: ensures xQuartz is running and properly configured; Only affects mac
// ensures network connections are set to true
// ensures xQuartz is running
// -- Parameters ---------------------------------------------------------------
// -----------------------------------------------------------------------------
export async function initX11(options: {interactive: boolean, debug: boolean, xquartz: boolean}) : Promise<ValidatedOutput<undefined>>
{
  const platform = os.platform()
  const shell = new ShellCommand(options.debug, false)

  if(platform == "darwin" && options.xquartz) // -- OSX -------------------------------------------
  {
    // -- 1. check if x11 settings plist file exists ---------------------------
    const x11_config_path = path.join(os.homedir(), 'Library/Preferences/org.macosforge.xquartz.X11.plist')
    if(!fs.existsSync(x11_config_path)) return new ValidatedOutput(false, undefined)
    var result = shell.output(`plutil -extract nolisten_tcp xml1 -o - ${x11_config_path}`) // note extract as xml1 instead of json since json exits in error
    if(!result.success) return new ValidatedOutput(false, undefined)
    var response: { flag: any; } & { flag: any; } = {flag: false}
    if((new RegExp('<true/>')).test(result.value))
    {
      if(options.interactive) {
        printValidatedOutput(new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.XQUARTZ_NOREMOTECONNECTION))
        var response = await inquirer.prompt([
          {
            name: "flag",
            message: `Should cjr automatically change this setting?`,
            type: "confirm",
          }
        ])
        if(!response.flag) return new ValidatedOutput(false, undefined)
      }
      // change setting
      if(!options.interactive || response?.flag == true)
        shell.output(`plutil -replace nolisten_tcp -bool NO ${x11_config_path}`)
    }
    // -- 2. start x11 if it's not already running -----------------------------
    var result = shell.output('xset', {q: {}})
    if(!result.success) return new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.MACFAILEDSTART)
    // -- 3. verify socket exists ----------------------------------------------
    if(!FileTools.existsDir(constants.X11_POSIX_BIND)) // -- nonexistant X11 folder ------
      return new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.MISSINGDIR(constants.X11_POSIX_BIND))
    const sockets = fs.readdirSync(constants.X11_POSIX_BIND)?.filter(file_name => new RegExp(/^X\d+$/)?.test(file_name))?.sort();
    if(sockets.length < 1) // -- no sockets ------------------------------------
      return new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.MACMISSINGSOCKET(constants.X11_POSIX_BIND))
  }

  return new ValidatedOutput(true, undefined)
}

// == Stack Functions ==========================================================

export function listStackNames(stacks_dir:string, absolute:boolean)
{
  const stack_names = fs.readdirSync(stacks_dir).filter((file_name: string) => !/^\./.test(path.basename(file_name)) && FileTools.existsDir(path.join(stacks_dir, file_name)))
  if(absolute) return stack_names.map((name:string) => path.join(stacks_dir, name))
  else return stack_names
}

// == AUTOLOAD & PROJECT SETTINGS FUNCTIONS ====================================

// SCANFORSETTINGSDIRECTORY searchs up the directory structure for a settings
// folder that contains a settings file with hostRoot: auto.
// -- Parameters ---------------------------------------------------------------
// dirpath: string - starting search location
// -- Returns ------------------------------------------------------------------
// ValidatedOutput - data is an object with fields:
//    - hostRoot: hostRoot where settings directory lives
//    - settings: settings that where loaded from file
export function scanForSettingsDirectory(dirpath: string):ValidatedOutput<ProjectSettings>
{
  var dirpath_parent = dirpath
  do {
    dirpath = dirpath_parent
    dirpath_parent = path.dirname(dirpath)
    // -- exit if settings file is invalid -------------------------------------
    const load_result = loadProjectSettings(dirpath)
    printValidatedOutput(load_result) // print any warnings if file is invalid
    if(load_result.success && load_result.value.getProjectRoot() == 'auto') {
      load_result.value.setProjectRoot(dirpath)
      return load_result
    }
  } while(dirpath != dirpath_parent)

  return new ValidatedOutput(false, new ProjectSettings())
}

// -----------------------------------------------------------------------------
// LOADPROJECTSETTINGS: loads any project settings from the cjr dir in hostRoot
// -- Parameters ---------------------------------------------------------------
// hostRoot: string - project hostRoot
// -- Returns ------------------------------------------------------------------
// result: ValidatedOutput - result from file load
// project_settings: ProjectSettings
// -----------------------------------------------------------------------------
export function loadProjectSettings(project_root: string): ValidatedOutput<ProjectSettings>
{
  const project_settings = new ProjectSettings()
  const result = project_settings.loadFromFile(projectSettingsYMLPath(project_root))
  return new ValidatedOutput(true, project_settings).absorb(result)
}



// == PROJECT ID FUNCTIONS =====================================================

// -----------------------------------------------------------------------------
// ENSUREPROJECTID: ensures that there is a file in the project settings folder
// that contains the project id.
// -- Parameters ---------------------------------------------------------------
// hostRoot  - project host root
// -----------------------------------------------------------------------------

export function ensureProjectId(hostRoot: string) : ValidatedOutput<string>
{
  if(!hostRoot) return new ValidatedOutput(false, "")
  var result = getProjectId(hostRoot)
  if(result.success) return result
  const file = new JSONFile(projectSettingsDirPath(hostRoot), true)
  const id = `${path.basename(hostRoot)}-${new Date().getTime()}`
  file.write(constants.project_settings.filenames.id, id)
  return getProjectId(hostRoot)
}

// -----------------------------------------------------------------------------
// ENSUREPROJECTID: returns ValidatdOutput that contains projectId
// -- Parameters ---------------------------------------------------------------
// hostRoot  - project host root
// -----------------------------------------------------------------------------

export function getProjectId(hostRoot: string) : ValidatedOutput<string>
{
  if(!hostRoot) return new ValidatedOutput(false, "")
  const proj_settings_abspath = projectSettingsDirPath(hostRoot)
  const file = new JSONFile(proj_settings_abspath, false)
  const result = file.read(constants.project_settings.filenames.id)
  if(result.success && result.value == "") // -- check if data is empty -----
    return new ValidatedOutput(false, "").pushError(
      ErrorStrings.PROJECTIDFILE.EMPTY(path.join(proj_settings_abspath, constants.project_settings.filenames.id))
    )
  return result
}

// == Interactive Functions ====================================================

export async function promptUserForGitPull(interactive: boolean)
{
    if(interactive) {
        const response = await inquirer.prompt([
        {
            name: "flag",
            message: `Stack directory already exists. Do you want to pull the latest version?`,
            default: true,
            type: "confirm",
        }
        ])
        return (response?.flag == true)
    }
    return true
}

export async function promptUserForJobId(job_manager: JobManager, stack_paths: Array<string>|undefined, states:Array<JobState>|undefined=undefined, silent: boolean = false)
{
  if(silent) return false;
  const job_info = job_manager.list({"filter": {"stack-paths":stack_paths, "states": states}})
  return await promptUserForId(job_info.value);
}

// helper function for promptUserForJobId & promptUserForResultId
export async function promptUserForId(id_info: Array<Dictionary>) : Promise<string>
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
      name: chalk`{italic ID}: ${JSTools.clipAndPad(j.id, 12, 15, true)} {italic COMMAND}: ${JSTools.clipAndPad(j.command, 20, 25, false)} {italic STATUS}: ${j.status}`,
      value: j.id
    }
  }).concat({name: "Exit", value: ""}),
}])
return response.id;
}

// -----------------------------------------------------------------------------
// JOBTOIMAGE creates an image from a running or completed job. If image_name is
// blank it will overwrite stack image
// -- Parameters ---------------------------------------------------------------
// runner       (RunDriver) - JSONFILE object for writing to disk
// job_id       (String) - job id to save to Image
// image_name   (string) - name of new imageName
// stack_path   (string) - name of container stack
// remove_job   (boolean) - if true job is removed on exit
// -----------------------------------------------------------------------------
export async function jobToImage(drivers: ContainerDrivers, job_id: string, image_name: string, remove_job: boolean = false, interactive: boolean = false)
{
  if(!job_id) return;
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
  if(!interactive || response?.flag == true) drivers.runner.jobToImage(job_id, image_name)
  if(remove_job) drivers.runner.jobDelete([job_id])
}

export async function promptUserToSnapshot(interactive: boolean = false) : Promise<boolean>
{
  if(interactive) {
    const response = await inquirer.prompt([
      {
        name: "flag",
        message: `Save Snapshot?`,
        default: true,
        type: "confirm",
      }
    ])
    return (response?.flag == true)
  }
  return true
}

export async function augmentImagePushParameters(options: DockerRegistryAuthConfig) : Promise<DockerRegistryAuthConfig>
{
  if( ! options.server ) {
      const response = await inquirer.prompt([
        {
          name: "server",
          message: `Auth Server:`,
          default: "https://index.docker.io/v1/",
          type: "input",
        }
      ])
      options.server = response.server
    }

  if( ! options.username ) {
    const response = await inquirer.prompt([
      {
        name: "username",
        message: `Registry Username:`,
        type: "input",
      }
    ])
    options.username = response.username
  }

  if( ! options.token ) {
    const response = await inquirer.prompt([
      {
        name: "token",
        message: `Registry Token (or Password):`,
        type: "password",
      }
    ])
    options.token = response.token
  }

  return options
}

export function printJobProperties(job_info: JobProperties) {
    Object.entries(job_info).map( 
        (kv:[string, string]) => console.log(chalk`  {italic ${kv[0]}:} ${kv[1]}`)
    )
}

// == Helper Functions for Podman Socket ===========================================

export function socketExists(shell: ShellCommand, socket: string) : boolean
{
  const result = trim(shell.output(`if [ -S ${ShellCommand.bashEscape(socket)} ] ; then echo "TRUE"; fi`))
  if(result.value == "TRUE") return true
  return false
}

export function startPodmanSocket(shell: ShellCommand, socket: string, sleep_seconds:number = 1) : ValidatedOutput<ChildProcess>
{
  shell.exec('mkdir', {p:{}}, [path.posix.dirname(socket)])
  const result = shell.execAsync('podman system service', {t: '0'}, [`unix:${socket}`], {detached: true, stdio: 'ignore'})
  if(result.success) result.value.unref()
  // sleep to allow socket to start
  shell.exec('sleep', {}, [`${sleep_seconds}`])
  return result
}

// == Sync Service ====================================================================

export function printSyncManagerOutput( output: {"local" : ValidatedOutput<any>, "remote": ValidatedOutput<any>} , always: boolean = false)
{
    if( always || ! output["local"].success ) {
        printStatusHeader("Local Service Errors", true)
        printValidatedOutput(output["local"])
        printStatusFooter(true)
    }

    if( always || ! output["remote"].success ) {
        printStatusHeader("Remote Service Errors", true)
        printValidatedOutput(output["local"]) // change to prepend error
        printStatusFooter(true)
    }
}