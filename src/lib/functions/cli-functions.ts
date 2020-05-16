import inquirer = require('inquirer')
import chalk = require('chalk')
import path = require('path')
import os = require('os')
import fs = require('fs-extra')

import { JobState, JobInfo, JobPortInfo} from '../drivers-containers/abstract/run-driver'
import { ContainerDrivers, Configurations } from '../drivers-jobs/job-driver'
import { Dictionary, project_idfile, projectSettingsDirPath, projectSettingsYMLPath, stack_bundle_rsync_file_paths, project_settings_file, X11_POSIX_BIND } from '../constants'
import { JSTools } from '../js-tools'
import { ValidatedOutput } from '../validated-output'
import { ErrorStrings, WarningStrings, StatusStrings } from '../error-strings'
import { JSONFile } from '../fileio/json-file'
import { ProjectSettings } from '../config/project-settings/project-settings'
import { printResultState } from './misc-functions'
import { ShellCommand } from '../shell-command'
import { BuildOptions } from './build-functions'
import { FileTools } from '../fileio/file-tools'

// == TYPES ====================================================================

// -- used by function bundleProject and bundleProjectSettings
export type ProjectBundleOptions =
{
  "project-root": string,
  "stack-path":   string,
  "config-files": Array<string>,
  "bundle-path":  string
  "stacks-dir"?:  string,
  "build-options"?: BuildOptions,
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

export function bundleProject(drivers: ContainerDrivers, configurations: Configurations, options: ProjectBundleOptions)
{
  const settings_dir = projectSettingsDirPath(options["bundle-path"])   // directory that stores project settings yml & stack
  // -- ensure directory structure ---------------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.COPYING_FILES, options?.verbose || false)
  fs.copySync(options["project-root"], options["bundle-path"])
  fs.removeSync(settings_dir) // remove any existing settings
  // -- bundle project settings ------------------------------------------------
  const ps_options:ProjectBundleOptions = { ... options, ...{'bundle-path': settings_dir}}
  return bundleProjectSettings(drivers, configurations, ps_options)
}

export function bundleProjectSettings(container_runtime: ContainerDrivers, configurations: Configurations, options: ProjectBundleOptions) : ValidatedOutput<undefined>
{
  printStatusHeader(StatusStrings.BUNDLE.PROJECT_SETTINGS, options?.verbose || false)
  const result = new ValidatedOutput(true, undefined)
  const load_result = loadProjectSettings(options["project-root"])
  if(!load_result.success) return new ValidatedOutput(false, undefined).absorb(load_result)
  const project_settings = load_result.value;
  // -- ensure directory structure ---------------------------------------------
  const bundle_stacks_dir = path.join(options["bundle-path"], 'stacks')
  fs.ensureDirSync(bundle_stacks_dir)
  // -- adjust project settings ------------------------------------------------
  project_settings.remove('stacks-dir')
  project_settings.remove('config-files')
  project_settings.remove('remote-name')
  project_settings.set({stack: `./stacks/${path.basename(options["stack-path"])}`})
  if(options?.["stacks-dir"]) project_settings.set({'stacks-dir': 'stacks'})
  const wf_result = project_settings.writeToFile(path.join(options['bundle-path'], project_settings_file))
  if(!wf_result.success) return new ValidatedOutput(false, undefined).absorb(wf_result)
  // -- copy stacks into bundle ------------------------------------------------
  const stacks = ((options?.["stacks-dir"]) ? listStackNames(options["stacks-dir"], true) : []).concat(options["stack-path"])
  const unique_stacks = [... new Set(stacks)]
  unique_stacks.map((stack_path:string) => {
    const bundle_result = bundleStack(container_runtime, configurations, {
      "stack-path": stack_path,
      "config-files": options["config-files"],
      "bundle-path": path.join(bundle_stacks_dir, path.basename(stack_path)),
      "verbose": options.verbose || false
      })
    if(!bundle_result.success) result.pushWarning(WarningStrings.BUNDLE.FAILED_BUNDLE_STACK(stack_path))
    })
  return result
}

export function bundleStack(container_runtime: ContainerDrivers, configurations: Configurations, options: StackBundleOptions) : ValidatedOutput<undefined>
{
  // -- ensure that stack can be loaded ----------------------------------------
  printStatusHeader(StatusStrings.BUNDLE.STACK_BUILD(options['stack-path']), options?.verbose || false)
  const stack_configuration = configurations.stack()
  const load_result = stack_configuration.load(options['stack-path'], options["config-files"])
  if(!load_result.success) load_result
  // -- prepare configuration for bundling -------------------------------------
  const copy_ops:Array<{source: string, destination: string}> = []
  const rsync_settings = {
    upload: stack_configuration.getRsyncUploadSettings(true),
    download: stack_configuration.getRsyncDownloadSettings(true)
  }
  // --> 1. remove binds
  const reb_result = stack_configuration.removeExternalBinds(options["stack-path"])
  printResultState(reb_result) // print any warnings
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
  return new ValidatedOutput(true, undefined)
}

// helper function user by startjob to print status
function printStatusHeader(message: string, verbose: boolean, line_width:number = 80) {
  if(verbose) console.log(chalk`-- {bold ${message}} ${'-'.repeat(Math.max(0,line_width - message.length - 4))}`)
}

export function nextAvailablePort(drivers: ContainerDrivers, port:number=1024) : number
{
  const job_info = drivers.runner.jobInfo() // get all jobs
  if(!job_info.success) return port
  // -- extract port and order ascending ---------------------------------------
  const ports:Array<number> = []
  job_info.value.map( (job_info:JobInfo) => ports.push(
      ... job_info.ports.map( (port_info:JobPortInfo) => port_info.hostPort )
    )
  )
  const ord_ports = [... new Set(ports)].sort()
  // -- return next available port ---------------------------------------------
  for(var i = 0; i <= ord_ports.length; i ++)  {
    if(ord_ports[i] == port) port++ // port is already used. increment
    if(ord_ports[i] > port) return port //port is free
  }
  return port
}

// -----------------------------------------------------------------------------
// INITX11: ensures xQuartz is running and properly configured; Only affects mac
// ensures network connections are set to true
// ensures xQuartz is running
// -- Parameters ---------------------------------------------------------------
// -----------------------------------------------------------------------------
export async function initX11(interactive: boolean, explicit: boolean) : Promise<ValidatedOutput<undefined>>
{
  const platform = os.platform()
  const shell = new ShellCommand(explicit, false)

  if(platform == "darwin") // -- OSX -------------------------------------------
  {
    // -- 1. check if x11 settings plist file exists ---------------------------
    const x11_config_path = path.join(os.homedir(), 'Library/Preferences/org.macosforge.xquartz.X11.plist')
    if(!fs.existsSync(x11_config_path)) return new ValidatedOutput(false, undefined)
    var result = shell.output(`plutil -extract nolisten_tcp xml1 -o - ${x11_config_path}`) // note extract as xml1 instead of json since json exits in error
    if(!result.success) return new ValidatedOutput(false, undefined)
    var response: { flag: any; } & { flag: any; } = {flag: false}
    if((new RegExp('<true/>')).test(result.value))
    {
      if(interactive) {
        printResultState(new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.XQUARTZ_NOREMOTECONNECTION))
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
      if(!interactive || response?.flag == true)
        shell.output(`plutil -replace nolisten_tcp -bool NO ${x11_config_path}`)
    }
    // -- 2. start x11 if it's not already running -----------------------------
    var result = shell.output('xset', {q: {}})
    if(!result.success) return new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.MACFAILEDSTART)
    // -- 3. verify socket exists ----------------------------------------------
    if(!FileTools.existsDir(X11_POSIX_BIND)) // -- nonexistant X11 folder ------
      return new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.MISSINGDIR(X11_POSIX_BIND))
    const sockets = fs.readdirSync(X11_POSIX_BIND)?.filter(file_name => new RegExp(/^X\d+$/)?.test(file_name))?.sort();
    if(sockets.length < 1) // -- no sockets ------------------------------------
      return new ValidatedOutput(true, undefined).pushWarning(WarningStrings.X11.MACMISSINGSOCKET(X11_POSIX_BIND))
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
    printResultState(load_result) // print any warnings if file is invalid
    if(load_result.success && load_result.value.get("project-root") == 'auto') {
      load_result.value.set({"project-root": dirpath})
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
  file.write(project_idfile, id)
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
  const result = file.read(project_idfile)
  if(result.success && result.value == "") // -- check if data is empty -----
    return new ValidatedOutput(false, "").pushError(
      ErrorStrings.PROJECTIDFILE.EMPTY(path.join(proj_settings_abspath, project_idfile))
    )
  return result
}

// == Interactive Functions ====================================================

export async function promptUserForJobId(drivers: ContainerDrivers, stack_paths: Array<string>|undefined, states:Array<JobState>|undefined=undefined, silent: boolean = false)
{
  if(silent) return false;
  const job_info = drivers.runner.jobInfo({"stack-paths":stack_paths, "states": states})
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
