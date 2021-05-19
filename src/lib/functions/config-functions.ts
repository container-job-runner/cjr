// == STACK AND JOB CONFIGURATION MODIFICATION FUNCTIONS ======================
// A series of functions for easily manipulating configuration
// ============================================================================

import * as os from 'os'
import * as path from 'path'
import fs = require('fs')
import constants = require('../constants')

import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { JobConfiguration } from '../config/jobs/job-configuration'
import { ShellCommand } from '../shell-command'
import { SshShellCommand } from '../ssh-shell-command'
import { ValidatedOutput } from '../validated-output'
import { WarningStrings } from '../error-strings'
import { label_strings } from '../constants'
import { trim } from './misc-functions'
import { PathTools } from '../fileio/path-tools'
import { TextFile } from '../fileio/text-file'
import { DockerStackConfiguration, DockerStackPortConfig } from '../config/stacks/docker/docker-stack-configuration'

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
// MOUNTFILEVOLUME mounts a volume at containerRoot with name of hostRoot
// -- Parameters ---------------------------------------------------------------
// runner: RunDriver - runner used to create volume
// configuration:Configuration - Object that inherits from abstract class Configuration
// hostRoot:string - Project root folder
// volume_id:string - volume id
// -----------------------------------------------------------------------------
export function mountFileVolume(stack_configuration: StackConfiguration<any>, hostRoot: string, volume_id: string)
{
  const hostRoot_basename = path.basename(hostRoot)
  stack_configuration.addVolume(volume_id, path.posix.join(stack_configuration.getContainerRoot(), hostRoot_basename))
}

// -----------------------------------------------------------------------------
// addGenericLabels adds important labels for each job
// -- Parameters ---------------------------------------------------------------
// configuration - Object that inherits from abstract class Configuration
// projectRoot: string - project-root on host
// stack_path: string - absolute path to stack used to run job
// -----------------------------------------------------------------------------
export function addGenericLabels(job_configuration: JobConfiguration<StackConfiguration<any>>, projectRoot: string)
{
  const stack_configuration = job_configuration.stack_configuration;
  job_configuration.addLabel(label_strings.job["container-root"],stack_configuration.getContainerRoot())
  job_configuration.addLabel(label_strings.job["command"], job_configuration.command.join(" "))
  if(projectRoot)
    job_configuration.addLabel(label_strings.job["project-root"], projectRoot)
  if(stack_configuration.stack_path)
    job_configuration.addLabel(label_strings.job["stack-path"], stack_configuration.stack_path)
  if(stack_configuration.stack_name)
    job_configuration.addLabel(label_strings.job["stack-name"], stack_configuration.stack_name)
  // add reserved ports label - helps keep track of ports that are intermittently used and whose container is run with --network=host in podman
  if ( stack_configuration instanceof DockerStackConfiguration )
    job_configuration.addLabel(
        label_strings.job["reserved-ports"],
        JSON.stringify(stack_configuration.getPorts().map((dpc : DockerStackPortConfig) => dpc.hostPort))
    )

  // -- add download settings --------------------------------------------------
  const author = new TextFile()
  author.add_extension = false
  const download_settings = stack_configuration.getRsyncDownloadSettings(true)
  if( download_settings.include ) {
    const contents = author.read(download_settings.include)
    job_configuration.addLabel(label_strings.job["download-include"], contents.value)
  }
  if( download_settings.exclude ) {
    const contents = author.read(download_settings.exclude)
    job_configuration.addLabel(label_strings.job["download-exclude"], contents.value)
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
// addX11Local: modify JobConfiguration to enable x11 for a local job
// -- Parameters ---------------------------------------------------------------
// job_configuration: JobConfiguration<any>
//    JobConfigration that should be modified
// options: {shell?: ShellCommand|SshShellCommand, platform?: string}
//    "user" - if specified, the host .Xuathority file will be bound to this
//             container user's directory. NOTE: this does not affect mac
//    "shell" - shell that is used to list running x11 sockets.
//              Default to local shell.
//    "platform" - operating system running containers. Defaults to os.platform()
// -----------------------------------------------------------------------------

export function addX11Local(job_configuration: JobConfiguration<StackConfiguration<any>>, options?:{user?: string, shell?: ShellCommand, platform?: string}) : ValidatedOutput<undefined>
{
    const result   = new ValidatedOutput(true, undefined)
    const shell    = options?.shell || new ShellCommand(false, false);
    const platform = options?.platform || os.platform()
    const stack_configuration = job_configuration.stack_configuration
    
    switch(platform)
    {
        case "linux" : // == LINUX =============================================
            const cur_security_opt = stack_configuration.getFlag("podman-security-opt") || stack_configuration.getFlag("security-opt")
            const security_opt_prepend = (cur_security_opt) ? `${cur_security_opt} ` : "" // keep any existing flags
            stack_configuration.addFlag("podman-security-opt", `${security_opt_prepend}label=disable`) // special flag for podman to access /tmp/.X11-unix
            result.absorb(
                new ValidatedOutput( // set DISPLAY environment variable
                    stack_configuration.addEnvironmentVariable("DISPLAY", "$DISPLAY", true, shell),
                    undefined
                ),
                new ValidatedOutput( // bind system X11 socket directory to container
                    stack_configuration.addBind(constants.X11_POSIX_BIND, constants.X11_POSIX_BIND),
                    undefined
                ),
                new ValidatedOutput( // bind user .Xauthority directory to container
                    stack_configuration.addBind(
                        path.join(os.homedir(), ".Xauthority"),
                        ( options?.user && options.user !== "root" ) ? path.posix.join("/home", options.user, ".Xauthority") : path.posix.join("/root", ".Xauthority"),
                        { "readonly" : true}
                    ),
                    undefined
                )
            )
            break;
        case "darwin" : // == MAC ==============================================
            result.absorb(
                shell.output("xhost +localhost"), // add localhost to xhost or container cannot connect to host X11 socket
                new ValidatedOutput(
                    addMacDisplayEnvironmentVariable(stack_configuration),
                    undefined
                )
            )
            break;
        default : // == Unsupported OS =========================================
            result.pushError(WarningStrings.X11.FLAGUNAVALIABLE)
    }

    return result;
}

// -----------------------------------------------------------------------------
// addMacDisplayEnvironmentVariable: sets DISPLAY to host.docker.internal:D 
// where D is an integer cooresponding to the x11 socket with highest number.
// -- Parameters ---------------------------------------------------------------
// configuration: StackConfiguration<any>
//    StackConfiguration to be modified
// -----------------------------------------------------------------------------

function addMacDisplayEnvironmentVariable( configuration: StackConfiguration<any> ) : boolean
{
    try 
    {
        const socket_number = fs.readdirSync( constants.X11_POSIX_BIND )
            .filter( ( s : string ) => /^X\d+$/.test(s))
            .map( ( s : string ) => s.replace("X", "") )
            .sort()
            .pop()
        if(socket_number === undefined) { // add display zero but report failure
            configuration.addEnvironmentVariable("DISPLAY", `host.docker.internal:0`)
            return false
        }
        return configuration.addEnvironmentVariable("DISPLAY", `host.docker.internal:${socket_number}`)
    }
    catch ( e ) 
    {
        return false;
    }    
}

// -----------------------------------------------------------------------------
// addX11Ssh: modify JobConfiguration to enable x11 for a remote job run using ssh
// -- Parameters ---------------------------------------------------------------
// job_configuration: JobConfiguration<any>
//    JobConfigration that should be modified
// options: {shell?: ShellCommand|SshShellCommand, platform?: string}
//    "shell" - shell that is used to list running x11 sockets.
//              Default to local shell.
//    "platform" - operating system running containers. Defaults to os.platform()
//    "env" - allows manual overridde of the container environment variable DISPLAY. 
//    "X11-host-bind" - location of the x11 socket. Defaults to constants.X11_POSIX_BIND
// -----------------------------------------------------------------------------

type addX11SshOptions = {
    "shell": SshShellCommand, 
    "platform": string, 
    "host-user": string,
    "container-user": string
    "mode": "network-host"|"hostname-host", 
    "env"?: {DISPLAY: string}, 
    "binds"?: {"x11-sockets" : string}
}

export function addX11Ssh(job_configuration: JobConfiguration<StackConfiguration<any>>, options: addX11SshOptions) : ValidatedOutput<undefined>
{
    const result = new ValidatedOutput(true, undefined)
    const stack_configuration = job_configuration.stack_configuration
    
    if(options.platform !== "linux") 
        return result.pushError(WarningStrings.X11.FLAGUNAVALIABLE)

    switch ( options.mode )
    {
        case "network-host": // container runs on same network as host
            
            job_configuration.stack_configuration.addFlag("network", "host");
            break;

        case "hostname-host":
            
            stack_configuration.addFlag("podman-security-opt", "label=disable") // special flag for podman to access /tmp/.X11-unix

            const hostname = options.shell.output("hostname")
            if( ! hostname.success ) return result.absorb(hostname)
            job_configuration.stack_configuration.addFlag("hostname", hostname.value)

            result.absorb(
                new ValidatedOutput(
                    stack_configuration.addBind(
                        options.binds?.["x11-sockets"] || constants.X11_POSIX_BIND, 
                        constants.X11_POSIX_BIND,
                        { "readonly" : true, "allow-nonexistant" : true, "remove-behavior" : "keep"}
                    ),
                    undefined
                )
            )
    }

    // add DISPLAY variable
    result.absorb(
        new ValidatedOutput(
            stack_configuration.addEnvironmentVariable("DISPLAY", options.env?.DISPLAY || "$DISPLAY", (options.env?.DISPLAY === undefined), options.shell),
            undefined
        )
    )

    // add xauth directory from remote resource
    const host_xauth_dir = path.posix.join("/home", options["host-user"], ".Xauthority")
    const container_xauth_dir = ( options["container-user"] && options["container-user"] !== "root" ) ? 
        path.posix.join("/home", options["container-user"], ".Xauthority") : 
        path.posix.join("/root", ".Xauthority")

    result.absorb(
        new ValidatedOutput(
            stack_configuration.addBind(
                host_xauth_dir, 
                container_xauth_dir, 
                { "readonly" : true, "allow-nonexistant" : true, "remove-behavior" : "keep"}
            ),
            undefined
        )
    )
    
    return result
}
