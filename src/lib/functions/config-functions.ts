// == STACK AND JOB CONFIGURATION MODIFICATION FUNCTIONS ======================
// A series of functions for easily manipulating configuration
// ============================================================================

import * as os from 'os'
import * as path from 'path'

import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobConfiguration } from '../config/jobs/job-configuration'
import { ShellCommand } from '../shell-command'
import { SshShellCommand } from '../remote/ssh-shell-command'
import { ValidatedOutput } from '../validated-output'
import { WarningStrings } from '../error-strings'
import { X11_POSIX_BIND, label_strings } from '../constants'
import { trim } from './misc-functions'
import { PathTools } from '../fileio/path-tools'
import { TextFile } from '../fileio/text-file'

type StackConfigOptions = {
  "image"?: string
  "entrypoint"?: Array<string>
  "ports"?: Array<{hostPort: number, containerPort: number, address?:string}>
  "environment"?: Array<{name: string, value: string, dynamic?:boolean}>
  "build-args"?: Array<{name: string, value: string, dynamic?:boolean}>
  "build-flags"?: Array<string>
}

export function updateStackConfig(stack_configuration: StackConfiguration<any>, options: StackConfigOptions)
{
  if(options.image !== undefined)
    stack_configuration.setImage(options.image)
  if(options.entrypoint !== undefined)
    stack_configuration.setEntrypoint(options.entrypoint)
  if(options.ports !== undefined)
    options.ports.map( (p: {hostPort: number, containerPort: number, address?:string}) => stack_configuration.addPort(p.hostPort, p.containerPort, p?.address) )
  if(options.environment !== undefined)
    options.environment.map( (e: {name: string, value: string, dynamic?:boolean}) => stack_configuration.addEnvironmentVariable(e.name, e.value, e.dynamic) )
  if(options?.['build-args'] !== undefined)
    options['build-args'].map( (b: {name: string, value: string, dynamic?:boolean}) => stack_configuration.addBuildArg(b.name, b.value, b.dynamic) )
  if(options?.['build-flags'])
    options?.["build-flags"].map( (f: string) => stack_configuration.addBuildFlag(f) )
}

type JobConfigOptions = {
  "command"?: Array<string>
  "synchronous"?: boolean
  "remove-on-exit"?: boolean
  "working-directory"?: string
  "labels"?: {[key:string] : string}
}

export function updateJobConfig(job_configuration: JobConfiguration<StackConfiguration<any>>, options: JobConfigOptions)
{
  if(options.command !== undefined)
    job_configuration.command = options.command
  if(options.synchronous !== undefined)
    job_configuration.synchronous = options.synchronous
  if(options['remove-on-exit'] !== undefined)
    job_configuration.remove_on_exit = options['remove-on-exit']
  if(options['working-directory'] !== undefined)
    job_configuration.working_directory = options['working-directory']
  if(options['labels'] !== undefined)
    job_configuration.labels = options.labels
}

// -----------------------------------------------------------------------------
// SETRELATIVEWORKDIR alters the working dir of a configuration iff hostDir is a
// child of hostRoot. Specifically, let cwd be a child of projectRoot, and let
// X be the relative path from projectRoot to cwd. This functions sets these
// working dir of the container to path.join(containerRoot, projectRoot, X)
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// projectRoot   - Project root folder
// cwd           - user directory (defaults to process.cwd())
// -----------------------------------------------------------------------------
export function setRelativeWorkDir(configuration: JobConfiguration<StackConfiguration<any>>, projectRoot: string, cwd: string = process.cwd())
{
  if(!projectRoot) return // should only be set if projectRoot is set
  const wd = containerWorkingDir(cwd, projectRoot, configuration.stack_configuration.getContainerRoot())
  if(wd) configuration.working_directory = wd
}

// -----------------------------------------------------------------------------
// BINDHOSTROOT adds a mount with type bind to a configuration that maps
// hostRoot (on host) to containerRoot (on container)
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// hostRoot      - Project root folder
// containerRoot - Container root folder
// -----------------------------------------------------------------------------
export function bindProjectRoot(configuration: StackConfiguration<any>, projectRoot: string)
{
  if(!projectRoot) return
  const projectRoot_basename = path.basename(projectRoot)
  configuration.addBind(projectRoot, path.posix.join(configuration.getContainerRoot(), projectRoot_basename))
}

// -----------------------------------------------------------------------------
// addGenericLabels adds important labels for each job
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// projectRoot: string - project-root on host
// stack_path: string - absolute path to stack used to run job
// -----------------------------------------------------------------------------
export function addGenericLabels(configuration: JobConfiguration<StackConfiguration<any>>, projectRoot: string)
{
  configuration.addLabel(label_strings.job["container-root"], configuration.stack_configuration.getContainerRoot())
  if(projectRoot)
    configuration.addLabel(label_strings.job["project-root"], projectRoot)
  if(configuration.stack_configuration.stack_path)
    configuration.addLabel(label_strings.job["stack-path"], configuration.stack_configuration.stack_path)
  // -- add download settings --------------------------------------------------
  const author = new TextFile()
  author.add_extension = false
  const download_settings = configuration.stack_configuration.getRsyncDownloadSettings(true)
  if( download_settings.include ) {
    const contents = author.read(download_settings.include)
    configuration.addLabel(label_strings.job["download-include"], contents.value)
  }
  if( download_settings.exclude ) {
    const contents = author.read(download_settings.exclude)
    configuration.addLabel(label_strings.job["download-exclude"], contents.value)
  }
}

// -----------------------------------------------------------------------------
// CONTAINERWORKINGDIR determines the appropriate cwd for a container so that it
// replicates the feel of working on the local machine if the user is currently
// cd into the hostRoot folder.
// -- Parameters ---------------------------------------------------------------
// cli_cwd (string) - absolute path where user is currently working on host
// proot   (string) - absolute path of project root folder on host
// croot   (string) - absolute path where hroot is mounted on container
// -----------------------------------------------------------------------------
export function containerWorkingDir(cwd:string, proot: string, croot: string)
{
  const proot_arr:Array<string> = PathTools.split(proot)
  const rel_path = PathTools.relativePathFromParent(proot_arr, PathTools.split(cwd))
  return (rel_path === false) ? false : path.posix.join(croot, path.basename(proot), ...rel_path)
}

// === X11 Functions ===========================================================
//
// A collection of functions for manipulating stack and job configurations
// so that X11 can be run from within a container.
//
// =============================================================================

// -----------------------------------------------------------------------------
// ADDX11: adds all configuration to enables x11 for a job
// -- Parameters ---------------------------------------------------------------
// job_configuration: JobConfiguration<any>
//    JobConfigration that should be modified
// options: {shell?: ShellCommand|SshShellCommand, platform?: string}
//    "shell" - shell that is used to list running x11 sockets.
//              Default to local shell.
//    "platform" - operating system running containers. Defaults to os.platform()
// -----------------------------------------------------------------------------

export function addX11(job_configuration: JobConfiguration<any>, options?:{shell?: ShellCommand|SshShellCommand, platform?: string}) : ValidatedOutput<undefined>
{
  const failure = new ValidatedOutput(false, undefined)
  const shell = options?.shell || new ShellCommand(false, false)
  const platform = options?.platform || os.platform()

  switch(platform)
  {
    case "linux": // == LINUX ==================================================
      job_configuration.stack_configuration.addFlag("network", "host") // allows for reuse of xauth from host
      const envadd = addDisplayEnvironmentVariable(
        job_configuration.stack_configuration,
        {"shell": shell, "platform": platform}
      )
      if(!envadd.success) return failure
      const secret = getXAuthSecret(shell)
      if(!secret.success) return failure
      prependXAuthCommand(job_configuration, secret.value)
      return new ValidatedOutput(true, undefined)
    case "darwin": // == MAC ===================================================
      const add_localhost = shell.output("xhost +localhost"); // add localhost to xhost or container cannot connect to host X11 socket
      if(!add_localhost.success) return failure
      return addDisplayEnvironmentVariable(
        job_configuration.stack_configuration,
        {"shell": shell, "platform": platform}
      )
    default: // == Unsupported OS ==============================================
      return failure.pushError(WarningStrings.X11.FLAGUNAVALIABLE)
  }

}

// -----------------------------------------------------------------------------
// ADDDISPLAYENVIRONMENTVARIABLE: sets DISPLAY in container to utilize host X11
// socket with highest number. For mac DISPLAY is set to host.docker.internal:D
// while for linux the host DISPLAY value is used.
// -- Parameters ---------------------------------------------------------------
// configuration: StackConfiguration<any>
//    StackConfiguration to be modified
// options: {shell?: ShellCommand|SshShellCommand, platform?: string}
//    "shell" - shell that is used to list running x11 sockets.
//              Default to local shell.
//    "platform" - operating system running containers. Defaults to os.platform()
// -----------------------------------------------------------------------------

export function addDisplayEnvironmentVariable(configuration: StackConfiguration<any>, options:{shell: ShellCommand|SshShellCommand, platform: string}) : ValidatedOutput<undefined>
{
  const shell = options.shell
  const platform = options.platform
  const result = new ValidatedOutput(true, undefined)

  switch(platform)
  {
    case "darwin": // == MAC ===================================================
      const socket_number = shell.output(`ls ${X11_POSIX_BIND} | grep -E "X[0-9]+"`).value // select X11 socket with highest number since xQuartz crash can leave behind dead sockets
        .trim()
        .split(/[\n\r]+/)  // split output on line breaks
        .sort()
        .pop()
        ?.replace("X", "") || "0"
      configuration.addEnvironmentVariable("DISPLAY", `host.docker.internal:${socket_number}`)
      return result
    case "linux": // == LINUX ==================================================
      return new ValidatedOutput(
        configuration.addEnvironmentVariable("DISPLAY", "$DISPLAY", true, shell), // pass host environment
        undefined)
    default:  // == Unsupported OS =============================================
      return result.pushError(WarningStrings.X11.FLAGUNAVALIABLE)
  }
}

// -----------------------------------------------------------------------------
// GETXAUTHSECRET: get display secret from host
// -- Parameters ---------------------------------------------------------------
//"shell" - shell that is used to list running x11 sockets.
//              Default to local shell.
// -----------------------------------------------------------------------------

export function getXAuthSecret(shell: ShellCommand|SshShellCommand) : ValidatedOutput<string>
{
  const failure = new ValidatedOutput<string>(false, "")
  const xauth_list = trim(shell.output("xauth list $DISPLAY"))
  const xauth_fields = xauth_list.value.split("  ") // assume format: HOST  ACCESS-CONTROL  SECRET
  if(!xauth_list.success) return failure
  if(xauth_fields.length != 3) return failure
  return new ValidatedOutput<string>(true, xauth_fields[2])
}

// -----------------------------------------------------------------------------
// PREPENDXAUTH: prepend commands to add xAuth from host into container, onto
// any existing command.
// -- Parameters ---------------------------------------------------------------
// job_configuration - jobconfiguration that requires modified command
// explicit: boolean - determines if commands run on host are to be printedshell
// -----------------------------------------------------------------------------

export function prependXAuthCommand(job_configuration: JobConfiguration<StackConfiguration<any>>, xauth_secret: string)
{
  const script = ['touch ~/.Xauthority', `xauth add $DISPLAY . ${xauth_secret}`, job_configuration.command].join(" && ")
  job_configuration.command = [`bash -c ${ShellCommand.bashEscape(script)}`]
}
