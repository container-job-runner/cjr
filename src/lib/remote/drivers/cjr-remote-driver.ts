import * as path from 'path'
import * as fs from 'fs-extra'
import {ValidatedOutput} from "../../validated-output"
import {JSTools} from "../../js-tools"
import {ShellCommand} from "../../shell-command"
import {SshShellCommand} from "../ssh-shell-command"
import {FileTools} from "../../fileio/file-tools"
import {StackConfiguration} from "../../config/stacks/abstract/stack-configuration"
import {BuildDriver} from "../../drivers/abstract/build-driver"
import {RemoteDriver, RemoteStartOptions, RemoteExecOptions, RemoteDeleteOptions} from "./remote-driver"
import {cli_bundle_dir_name, projectIDPath, project_idfile, job_info_label, stack_bundle_rsync_file_paths} from '../../constants'
import {remote_storage_basename, remoteStoragePath, remote_stack_rsync_config_dirname} from '../constants'
import {ensureProjectId, containerWorkingDir, promptUserForId, getProjectId, bundleStack, JobOptions, CopyOptions, OutputOptions, ContainerRuntime, StackBundleOptions} from '../../functions/run-functions'
import {printResultState} from '../../functions/misc-functions'
import {ErrorStrings, WarningStrings, StatusStrings} from '../error-strings'
import {Resource} from "../../remote/config/resource-configuration"

type Dictionary = {[key: string]: any}

// internal data type used for start job
export type RemoteJobParams = {
  'remote-job-dir': string, // path  that contains all job data
  'remote-project-root': string,  // path to hostRoot
  'remote-stack-path': string, // path to stack
  'project-id': string, // id of project that started job
  'previous-job-id'?: string, // id of previous job (used by job:shell and job:exec)
  'auto-copy'?: boolean // turn on --autocopy flag
}

export type MultiplexOptions = {
  "autodisconnect"?:               boolean,
  "autoconnect"?:                  boolean,
  "restart-existing-connection"?:  boolean
}

export class CJRRemoteDriver extends RemoteDriver
{

  private interactive_ssh_options = {ssh: {interactive: true}}
  private transferrable_flags = { // displays the flags that will be passed to remote cjr commands. All other flags are ignored
     'job:attach' : ['explicit'],
     'job:copy'   : ['explicit', 'verbose', 'all'],
     'job:delete' : ['explicit', 'silent'],
     'job:labels' : ['all', 'all-completed', 'all-running', 'silent'],
     'job:list'   : ['explicit', 'verbose', 'json', 'all'],
     'job:log'    : ['explicit', 'lines'],
     'job:stop'   : ['explicit', 'all', 'all-completed', 'all-running', 'silent'],
     'job:shell'  : ['explicit', 'discard'],
     'job:jupyter': ['build-mode', 'explicit'], // only used by stop, list, url
     '$'          : ['explicit', 'async', 'verbose', 'silent', 'port', 'x11', 'message', 'label', 'autocopy', 'build-mode']
  }
  private ssh_shell: SshShellCommand
  private label_names = {'remote-job-dir': 'remote-job-dir', 'project-id': 'project-id', 'project-root': 'hostRoot', 'stack-path': 'stack'}
  private remoteStackName = (remote_job_dir: string, stack_name: string) => `${path.posix.basename(remote_job_dir)}-${stack_name}`
  private remoteStackPath = (remote_job_dir: string, stack_name: string) => path.posix.join(remote_job_dir, this.remoteStackName(remote_job_dir, stack_name))
  private multiplex_options: MultiplexOptions = {"autodisconnect": true, "autoconnect": true, "restart-existing-connection": true}

  constructor(ssh_shell: SshShellCommand, output_options: OutputOptions, storage_directory: string, multiplex_options: MultiplexOptions = {})
  {
    super(output_options, storage_directory);
    this.ssh_shell = ssh_shell
    this.multiplex_options = { ...this.multiplex_options, ...multiplex_options}
  }

  jobAttach(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    return this.ssh_shell.exec(
      'cjr job:attach',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:attach']),
      (args.id) ? [args.id] : [],
      this.interactive_ssh_options
    )
  }

  jobCopy(resource: Resource, copy_options:CopyOptions)
  {
    // -- validate parameters --------------------------------------------------
    if(copy_options.ids.length == 0) return (new ValidatedOutput(false)).pushError(ErrorStrings.REMOTEJOB.EMPTY_ID)
    // -- do not copy if there is no local hostRoot set ------------------------
    if(!copy_options['host-path']) return (new ValidatedOutput(false)).pushError(ErrorStrings.REMOTEJOB.COPY.EMPTY_LOCAL_HOSTROOT)
    // -- start ssh master -----------------------------------------------------
    var result = this.initConnection(resource)
    if(!result.success) return result
    // == read json job data ===================================================
    this.printStatus(StatusStrings.REMOTEJOB.COPY.READING_JOBINFO, this.output_options.verbose)
    result = this.getJobLabels(copy_options.ids)
    if(!result.success) return this.stopMultiplexMasterAndReturn(result)
    const all_job_labels = result.data
    const matching_ids:Array<string> = Object.keys(all_job_labels)
    if(matching_ids.length == 0) return this.stopMultiplexMasterAndReturn(new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.NO_MATCHING_ID]))
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)

    // == map over each matching job ===========================================
    result = new ValidatedOutput(true)
    matching_ids.map((job_id:string) => {
      // -- extract job information --------------------------------------------
      const job_labels = all_job_labels[job_id]
      const remote_project_root = job_labels?.[this.label_names['project-root']] || ""
      const remote_project_id   = job_labels?.[this.label_names['project-id']] || ""
      const remote_stack_path   = job_labels?.[this.label_names['stack-path']] || ""
      // -- exit with warning if remote job has not hostRoot -------------------
      if(!remote_project_root)
        return result.pushWarning(
          WarningStrings.REMOTEJOB.COPY.EMPTY_REMOTE_HOSTROOT(job_id)
        )

      // == 1. verify remote project matches with local project  ===============
      if(!copy_options["force"]) {
        // -- read local project id file ---------------------------------------
        result = getProjectId(copy_options['host-path'] || "")
        const local_project_id = (result.success) ? result.data : false;
        // verify matching project ids
        if(remote_project_id != local_project_id) {
          return result.pushWarning(
            ErrorStrings.REMOTEJOB.COPY.DIFFERING_PROJECT_ID(job_id)
          )
        }
      }

      // == 2. Run Remote CJR Remote COPY ======================================
      const copy_flags:Dictionary = {mode: copy_options.mode}
      if(copy_options['manual']) copy_flags['manual'] = {}
      if(this.output_options.verbose) copy_flags['verbose'] = {}
      if(this.output_options.explicit) copy_flags['explicit'] = {}
      if(this.output_options.silent) copy_flags['silent'] = {}
      const exec_result = this.ssh_shell.exec(
        'cjr job:copy',
        copy_flags,
        [job_id],
        this.interactive_ssh_options
      )
      if(!exec_result.success) return result.absorb(exec_result)

      // == 3. Copy Directories ================================================
      this.printStatus(StatusStrings.REMOTEJOB.COPY.DOWNLOADING_FILES, this.output_options.verbose)
      const pull_result = this.pullProjectFiles({
          "local-project-root": (copy_options['host-path'] as string), // garanteed string due to early exit condition
          "remote-project-root": remote_project_root,
          "remote-stack-path": remote_stack_path,
          "copy-mode": copy_options['mode'],
          "verbose": this.output_options.verbose
        })
      result.absorb(pull_result)
      this.printStatus(StatusStrings.REMOTEJOB.DONE, true)

    })

    // -- stop ssh master -----------------------------------------------------
    return this.stopMultiplexMasterAndReturn(result)
  }

  jobDelete(resource: Resource, delete_options:RemoteDeleteOptions)
  {
    // -- validate parameters -----------------------------------------------
    if(delete_options['ids'].length == 0)
      return new ValidatedOutput(true).pushWarning(ErrorStrings.REMOTEJOB.EMPTY_ID)
    // -- start ssh master -----------------------------------------------------
    var result = this.initConnection(resource)
    if(!result.success) return result
    // -- 1. read job info and extract job stacks & job directories ------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.READING_JOBINFO, this.output_options.verbose)
    result = this.getJobLabels(delete_options['ids'])
    if(!result.success) return this.stopMultiplexMasterAndReturn(result)
    const all_job_labels = result.data
    // -- 2. filter out jobs where Remote path does not contain remote_job_dir -
    const job_labels = JSTools.oSubset(
      all_job_labels,
      Object.keys(all_job_labels).filter(
        (id:string) => (new RegExp(`/${remote_storage_basename}/`)).test(all_job_labels[id]?.[this.label_names['remote-job-dir']] || "")
    ))
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)

    const cjr_flags:Dictionary = {}
    if(this.output_options.explicit) cjr_flags['explicit'] = {}
    if(this.output_options.silent) cjr_flags['silent'] = {}
    // -- 3. run cjr:delete ----------------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.JOBS, this.output_options.verbose)
    const job_ids = Object.keys(job_labels)
    if(job_ids.length == 0) return this.stopMultiplexMasterAndReturn(new ValidatedOutput(true, [], [], [WarningStrings.REMOTEJOB.DELETE.NO_MATCHING_REMOTEJOBS])) // no jobs to delete
    result = this.ssh_shell.exec(
      'cjr job:delete',
      cjr_flags,
      job_ids,
      this.interactive_ssh_options
    )
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- 4. run cjr:rmi for associated image ----------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.IMAGES, this.output_options.verbose)
    const job_stack_paths  = job_ids.map((id:string) => job_labels[id]?.[this.label_names['stack-path']])
    result = this.ssh_shell.exec(
      'cjr stack:rmi',
      cjr_flags,
      job_stack_paths,
      this.interactive_ssh_options
    )
    if(!result.success) return this.stopMultiplexMasterAndReturn(result)
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- 5. Delete Data Directories -------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.REMOTE_DIRECTORIES, this.output_options.verbose)
    // ----> stacks & job_directories (use set since there may be duplicates)
    const job_remote_paths = job_ids.map((id:string) => job_labels[id]?.[this.label_names['remote-job-dir']])
    const unique_rm_paths = [ ... new Set(job_stack_paths.concat(job_remote_paths))] // [ .. new Set(Array<string>)]  gives unique values only
    result = this.ssh_shell.exec('rm', {r: {}}, unique_rm_paths)
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    return this.stopMultiplexMasterAndReturn(result)
  }

  jobList(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    return this.ssh_shell.exec(
      'cjr job:list',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:list']),
      [],
      this.interactive_ssh_options
    )
  }

  jobLog(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    return this.ssh_shell.exec(
      'cjr job:log',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:log']),
      (args.id) ? [args.id] : [],
      this.interactive_ssh_options
    )
  }

  jobExec(resource: Resource, container_runtime:ContainerRuntime, job_options: JobOptions, exec_options: RemoteExecOptions)
  {
    // -- validate parameters --------------------------------------------------
    if(!exec_options.id) return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.EMPTY_ID])
    // -- start ssh master -----------------------------------------------------
    var result = this.initConnection(resource, {x11: job_options?.x11 || false})
    if(!result.success) return result
    // -- read json job data to extract projectid ------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.SHELL.READING_JOBINFO, this.output_options.verbose)
    result = this.getJobLabels([exec_options.id])
    if(!result.success) return this.stopMultiplexMasterAndReturn(result)
    const matching_ids = Object.keys(result.data)
    if(matching_ids.length == 0) return this.stopMultiplexMasterAndReturn(new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.NO_MATCHING_ID]))
    const job_id = matching_ids[0]
    const remote_project_id = result.data[job_id]?.[this.label_names['project-id']]
    const remote_project_root = result.data[job_id]?.[this.label_names['project-root']]
    const parent_remote_job_dir = result.data[job_id]?.[this.label_names['remote-job-dir']] // exec stacks will be placed inside of the remote_job_dir of their parent job if stack-upload-mode is uncached
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- ensure project has ID ------------------------------------------------
    if(exec_options['host-project-root']) result = ensureProjectId(exec_options['host-project-root'])
    if(!result.success) return result;
    const local_project_id:string = (exec_options['host-project-root']) ? result.data : "EMPTY" // USE ID EMPTY FOR JOBS WITH NO HOST ROOT
    const local_host_root  = (local_project_id === remote_project_id) ? (exec_options['host-project-root'] as string) : ""
    // -- create remote tmp directory for job ----------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.CREATING_DIRECTORIES, this.output_options.verbose)
    result = this.getStackUploadDirectories(resource, {
      'stack-upload-mode':  exec_options['stack-upload-mode'],
      'local-stack-name':   container_runtime.builder.stackName(job_options['stack-path']),
      'project-id':         local_project_id,
      'parent-remote-job-dir' : parent_remote_job_dir
    })
    if(!result.success) return this.stopMultiplexMasterAndReturn(result);
    const remote_stack_path = result.data
    const remote_job_dir    = result.data
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- copy stack -----------------------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.UPLOADING_STACK, this.output_options.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    result = this.pushStack(container_runtime, {
      "local-stack-path":job_options['stack-path'],
      "local-config-files":job_options['config-files'],
      "remote-stack-path": remote_stack_path,
      "verbose": this.output_options.verbose
    })
    if(!result.success) return this.stopMultiplexMasterAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- start job ------------------------------------------------------------
    this.printStatus((job_options['synchronous']) ? StatusStrings.REMOTEJOB.START.RUNNING_JOB : StatusStrings.REMOTEJOB.START.STARTING_JOB, true)
    if(local_host_root) job_options['host-root'] = local_host_root
    result = this.CJRJobStart(job_options, {
        'remote-job-dir': remote_job_dir, // path  that contains all job data
        'remote-stack-path': remote_stack_path, // path to stack
        'remote-project-root': remote_project_root,
        'project-id': remote_project_id, // id of project that started job
        'previous-job-id': exec_options.id
      }, exec_options.mode)
    if(!result.success) return this.stopMultiplexMasterAndReturn(result);
    // -- stop ssh master ------------------------------------------------------
    return this.stopMultiplexMasterAndReturn(result);
  }

  //jobStart(resource: Dictionary, builder: BuildDriver, stack_path: string, overloaded_config_paths: Array<string>, flags: Dictionary, args: Dictionary, argv: Array<string>)
  jobStart(resource: Resource, container_runtime:ContainerRuntime, job_options: JobOptions, remote_options: RemoteStartOptions)
  {
    const host_root = job_options['host-root'] || ""
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- ensure project has ID ------------------------------------------------
    if(host_root) result = ensureProjectId(host_root)
    if(!result.success) return result;
    const project_id:string = (host_root) ? result.data : "EMPTY" // USE ID EMPTY FOR JOBS WITH NO HOST ROOT
    // -- start ssh master -----------------------------------------------------
    var result = this.initConnection(resource, {x11: job_options?.x11 || false})
    if(!result.success) return result
    // -- set and create remote directories for job ----------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.CREATING_DIRECTORIES, this.output_options.verbose)
    result = this.getUploadDirectories(resource, {
        "local-project-root": host_root,
        "local-stack-name":   container_runtime.builder.stackName(job_options['stack-path']),
        "project-id":         project_id,
        "file-upload-mode":   remote_options["file-upload-mode"],
        "stack-upload-mode":  remote_options["stack-upload-mode"]
    })
    if(!result.success) return result
    const remote_job_dir: string = result.data['remote-job-dir']
    const remote_project_root: string = result.data['remote-project-root']
    const remote_stack_path: string = result.data['remote-stack-path']
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- copy stack -----------------------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.UPLOADING_STACK, this.output_options.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    result = this.pushStack(container_runtime, {
      "local-stack-path":job_options['stack-path'],
      "local-config-files":job_options['config-files'],
      "remote-stack-path": remote_stack_path,
      "verbose": this.output_options.verbose
    })
    if(!result.success) return this.stopMultiplexMasterAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- copy files & project id ----------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.UPLOADING_FILES, this.output_options.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    result = this.pushProjectFiles(container_runtime, {
      "local-project-root": host_root,
      "local-stack-path": job_options['stack-path'],
      "local-config-files": job_options['config-files'],
      "remote-project-root": remote_project_root,
      "verbose": this.output_options.verbose
    })
    if(!result.success) return this.stopMultiplexMasterAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- start job ------------------------------------------------------------
    this.printStatus((job_options['synchronous']) ? StatusStrings.REMOTEJOB.START.RUNNING_JOB : StatusStrings.REMOTEJOB.START.STARTING_JOB, true)
    result = this.CJRJobStart(job_options, {
        'remote-job-dir': remote_job_dir, // path  that contains all job data
        'remote-project-root': remote_project_root,  // path to hostRoot
        'remote-stack-path': remote_stack_path, // path to stack
        'project-id': project_id, // id of project that started job
      }, '$')
    if(!result.success) return this.stopMultiplexMasterAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    if(remote_options['auto-copy'] && host_root)
    {
      this.printStatus(StatusStrings.REMOTEJOB.COPY.DOWNLOADING_FILES, this.output_options.verbose)
      const pull_result = this.pullProjectFiles({
          "local-project-root": host_root,
          "remote-project-root": remote_project_root,
          "remote-stack-path": remote_stack_path,
          "copy-mode": 'update',
          "verbose": this.output_options.verbose
        })
      result.absorb(pull_result)
      this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    }
    return this.stopMultiplexMasterAndReturn(result);
  }

  jobStop(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    return this.ssh_shell.exec(
      'cjr job:stop',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:stop']),
      (args.id) ? [args.id] : [],
      this.interactive_ssh_options
    )
  }

  jobState(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    return this.ssh_shell.exec(
      'cjr job:state',
      {},
      [args.id],
      this.interactive_ssh_options
    )
  }

  async promptUserForJobId(resource: Dictionary, interactive: boolean)
  {
    if(!interactive) return ""
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    var result = this.ssh_shell.output(
      'cjr job:list', {json: {}}, [],
      this.interactive_ssh_options,
      'json'
    )
    if(!result.success) return result;
    return await promptUserForId(result.data)
  }

  jobInfo(resource: Dictionary, status?: string)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    result = this.ssh_shell.output(
      'cjr job:list',
      {json:{}},
      [],
      this.interactive_ssh_options,
      'json'
    )
    if(!result.success) return result
    // -- filter jobs ----------------------------------------------------------
    if(status) result.data = result.data.filter((job:Dictionary) => (job.status === status))
    return result

  }

  // -- Jupyter commands -------------------------------------------------------

  jobJupyterStop(resource: Dictionary, id: string) {
    return this.jobJupyterGeneric(resource, id, 'stop', 'exec');
  }

  jobJupyterList(resource: Dictionary, id: string) {
    return this.jobJupyterGeneric(resource, id, 'list', 'exec')
  }

  jobJupyterUrl(resource: Dictionary, id: string, options: Dictionary = {remoteip: true}) {
    var result = this.jobJupyterGeneric(resource, id, 'url', 'output')
    if(result.success && options?.remoteip && resource.address)
      result.data = result.data?.replace(/(?<=http:\/\/)\S+(?=:)/, resource.address)
    return result
  }

  private jobJupyterGeneric(resource: Dictionary, id: string, command: 'stop'|'list'|'url', mode:'output'|'exec')
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    const cjr_cmd   = 'cjr job:jupyter'
    const cjr_flags = (this.output_options.explicit) ? {explicit: {}} : {}
    const cjr_args  = [id, command]
    if(mode === 'output')
      return this.ssh_shell.output(cjr_cmd, cjr_flags, cjr_args, this.interactive_ssh_options)
    else
      return this.ssh_shell.exec(cjr_cmd, cjr_flags, cjr_args, this.interactive_ssh_options)
  }

  // -- Helper Functions -------------------------------------------------------

  private cliFlagsToShellFlags(flags: Dictionary, fields: Array<string>)
  {
    const shell_flags:Dictionary = {}
    const cli_flags = JSTools.oSubset(flags, fields)
    for(let prop in cli_flags)
    {
      if(typeof cli_flags[prop] === 'boolean' && cli_flags[prop])
        shell_flags[prop] = {}
      if(typeof cli_flags[prop] === 'string')
        shell_flags[prop] = cli_flags[prop]
    }
    return shell_flags
  }

  private printStatus(message: string, newline: boolean)
  {
   if(this.output_options.silent) return
   if(newline) console.log(message)
   else process.stdout.write(message)
  }

  private scpShellOptions(){
   return (this.output_options.verbose) ? {} : {stdio:'ignore'}
  }

  // -- Core Remote Functions --------------------------------------------------

  // MKTEMPDIR: creates a temporary directory and any specified child directories
  // parent_abs_path: string - absolute path where tmp folder should be created
  // sub_paths: Array<string> - names of any subdirectories
  // escape_parent_path: boolean - if true parent_abs_path will be properly escaped. However we allow to avoid escaping so that you can use environmental variables like $HOME. However paths can no longer contain quotes.
  private mkTempDir(parent_abs_path: string, subpaths: Array<string>=[], escape_parent_path: boolean = true)
  {
   const escaped_parent_abs_path = (escape_parent_path) ? ShellCommand.bashEscape(parent_abs_path) : `"${parent_abs_path}"`
   const commands = [
     `mkdir -p ${escaped_parent_abs_path}`,
     `JOBDIR=$(mktemp --tmpdir=${escaped_parent_abs_path} --directory)`
   ].concat(
     subpaths.map((subpath:string) => `mkdir -p $JOBDIR/${ShellCommand.bashEscape(subpath)}`),
     [`echo $JOBDIR`]
   )
   return this.ssh_shell.output(commands.join(' && '),{},[])
  }

  // MKDIRS: creates a remote directory and any specified child directories
  // parent_abs_path: string - absolute path where subfolders should be created
  // sub_paths: Array<string> - names of any subdirectories
  // escape_parent_path: boolean - if true parent_abs_path will be properly escaped. However we allow to avoid escaping so that you can use environmental variables like $HOME. However paths can no longer contain quotes.
  private mkDirs(parent_abs_path: string, subpaths: Array<string>=[], escape_parent_path: boolean = true)
  {
   const escaped_parent_abs_path = (escape_parent_path) ? ShellCommand.bashEscape(parent_abs_path) : `"${parent_abs_path}"`
   const commands = subpaths.map((subpath:string) => `mkdir -p ${escaped_parent_abs_path}/${ShellCommand.bashEscape(subpath)}`)
   .concat([`echo "${escaped_parent_abs_path}"`])
   return this.ssh_shell.output(commands.join(' && '),{},[])
  }

  // PUSHSTACK: copies a stack to remote resource inside specified parent folder.
  // builder - BuildDriver for building stack
  // stack_path: path on local machine where stack is located
  // configuration: Dictionary - result from stack configuration.bundle()
  private pushStack(container_runtime: ContainerRuntime, options: {"local-stack-path":string, "local-config-files":Array<string>, "remote-stack-path": string, verbose: boolean})
  {
    // -- 1. create local tmp directory ----------------------------------------
    var result = FileTools.mktempDir(
      path.join(this.storage_directory, cli_bundle_dir_name),
      this.ssh_shell.shell)
    if(!result.success) return result;
    const temp_stack_path = result.data
    const removeTmpStackAndReturn = (result: ValidatedOutput) => {
      fs.remove(temp_stack_path);
      return result
    }
    // -- 2. bundle stack config  inside tmp directory -------------------------
    const bundle_options:StackBundleOptions =
    {
      "stack-path":   options['local-stack-path'],
      "config-files": options['local-config-files'],
      "bundle-path":  temp_stack_path,
      "build-mode":   'no-build',
      "config-files-only": true
    }
    result = bundleStack(container_runtime, bundle_options)
    if(!result.success) removeTmpStackAndReturn(result)
    // -- 3. upload local stack ------------------------------------------------
    if(path.isAbsolute(options['local-stack-path']) && fs.existsSync(options['local-stack-path']))
    {
      const rsync_stack_flags:Dictionary = {a:{}, delete: {}}
      if(options.verbose) rsync_stack_flags.v = {}
      result = this.ssh_shell.rsync(
        FileTools.addTrailingSeparator(options['local-stack-path'], 'posix'), // upload contents
        options['remote-stack-path'],
        'push',
        rsync_stack_flags
      )
    }
    if(!result.success) removeTmpStackAndReturn(result)
    // -- 4. upload run configuration (overwrites config files from step 3) ----
    // Note: breaking upload into two steps prevents the copying of files from
    // local stack which is important if large files are in stack (e.g. tarred images)
    const rsync_config_flags:Dictionary = {a:{}}
    if(options.verbose) rsync_config_flags.v = {}
    result = this.ssh_shell.rsync(
      FileTools.addTrailingSeparator(temp_stack_path, 'posix'), // upload contents
      options['remote-stack-path'],
      'push',
      rsync_config_flags
    )
    // -- 4. remove local tml directory ----------------------------------------
    return removeTmpStackAndReturn(result);
  }


  // scp project files remote resource
  private pushProjectFiles(container_runtime: ContainerRuntime, options: {"local-project-root":string, "local-stack-path":string, "local-config-files":Array<string>, "remote-project-root": string, verbose: boolean})
  {
    if(!options['local-project-root']) return new ValidatedOutput(true)
    if(!options['remote-project-root']) return new ValidatedOutput(false).pushError('Internal Error: missing remote-project-root')
    // -- 1. load stack configuration ------------------------------------------
    var result = container_runtime.builder.loadConfiguration(options['local-stack-path'], options['local-config-files'])
    if(!result.success) return result
    const configuration:StackConfiguration = result.data
    // -- 3. transfer stack over rsync ------------------------------------------
    const upload_settings = configuration.getRsyncUploadSettings(true)
    const rsync_flags:Dictionary = {a:{}, delete:{}}
    if(options.verbose) rsync_flags.v = {}
    // note: always add include before exclude
    if(upload_settings.include && FileTools.existsFile(upload_settings.include)) rsync_flags['include-from'] = upload_settings.include
    if(upload_settings.exclude && FileTools.existsFile(upload_settings.exclude)) rsync_flags['exclude-from'] = upload_settings.exclude
    result = this.ssh_shell.rsync(
      FileTools.addTrailingSeparator(options["local-project-root"], 'posix'), // upload contents
      options["remote-project-root"],
      'push',
      rsync_flags
    )
    return result
  }


  private pullProjectFiles(options: {"local-project-root":string, "remote-project-root": string, "remote-stack-path": string, 'copy-mode': 'update'|'overwrite'|'mirror', verbose: boolean})
  {
    if(!options["local-project-root"]) return new ValidatedOutput(true) // projects with no hostRoot do not require copy

    // -- extract rsync configuration files from remote stack ------------------
    var result = this.pullRsyncConfig(options['remote-stack-path'], options.verbose)
    if(!result.success) return result
    const rconfig: {local_tmp_dir: string, rsync_files_flag:{'include-from'?:string, 'exclude-from'?:string}} = result.data
    // -- rsync projec files ---------------------------------------------------
    const rsync_flags:Dictionary = {
     ...{a: {}},
     ...rconfig.rsync_files_flag
    }
    if(options.verbose) rsync_flags['v'] = {}
    switch(options['copy-mode'])
    {
      case "update":
        rsync_flags['update'] = {}
        break
      case "overwrite":
        break
      case "mirror":
        rsync_flags['delete'] = {}
        break
    }
    result = this.ssh_shell.rsync(
     FileTools.addTrailingSeparator(options['local-project-root']), // pull folder contents
     FileTools.addTrailingSeparator(options['remote-project-root'], 'posix'),
     'pull',
     rsync_flags
    )
    fs.removeSync(rconfig.local_tmp_dir)
    return result
  }

  private CJRJobStart(job_options: JobOptions, remote_params:RemoteJobParams, mode:"$"|"job:shell"|"job:exec"|"job:jupyter")
  {
    // -- set args -------------------------------------------------------------
    var cjr_args:Array<string> = []
    if(mode === '$')
      cjr_args = [job_options['command']]
    else if(mode === "job:exec")
      cjr_args = [remote_params['previous-job-id'] || "", job_options['command']]
    else if(mode === "job:shell")
      cjr_args = [remote_params['previous-job-id'] || ""]
    else if(mode === "job:jupyter")
      cjr_args = [remote_params['previous-job-id'] || "", 'start', job_options['command']]
    // -- set flags ------------------------------------------------------------
    const cjr_flags:Dictionary = {
      'stack':        remote_params["remote-stack-path"],
      'build-mode':   job_options["build-mode"],
      'no-autoload':  {}
    }
    if(mode == "$") cjr_flags['keep-record'] = {} // ensure both bind and volume jobs are not deleted (to allow user to copy them back)
    if(mode == "$") cjr_flags['file-access'] = job_options["file-access"]
    if(mode == "$" && remote_params['remote-project-root']) cjr_flags['project-root'] = remote_params['remote-project-root']
    if(mode == "$" || mode == "job:exec") {
      if(job_options['synchronous']) cjr_flags['sync'] = {}
      else cjr_flags['async'] = {}
    }
    if(mode === '$' && remote_params['auto-copy']) cjr_flags['auto-copy'] = {}
    if(job_options['x11']) cjr_flags["x11"] = {}
    if(job_options['host-root']) {
      const remote_wd = containerWorkingDir(job_options['cwd'], job_options['host-root'], path.posix.dirname(remote_params['remote-project-root']))
      if(remote_wd) cjr_flags['working-directory'] = remote_wd
    }

    if(this.output_options.explicit) cjr_flags['explicit'] = {}
    if(this.output_options.silent || mode === "job:jupyter") cjr_flags['silent'] = {}
    if(this.output_options.verbose) cjr_flags['verbose'] = {}

    const labels:Array<string> = job_options['labels']?.map((label:{key:string, value: string}) => `${label.key}=${label.value}`) || []
    const ports:Array<string>  = job_options['ports']?.map((port:{hostPort:number, containerPort: number}) => `${port.hostPort}:${port.containerPort}`) || []

    // Note: OCLIF does not support flags with multiple values before args
    //       (https://github.com/oclif/oclif/issues/190). Therefore we must
    //       manually append the --label and --port flags at end of cjr command.
    const cjr_command = this.ssh_shell.shell.commandString(`cjr ${mode}`, cjr_flags, cjr_args)
     + this.ssh_shell.shell.commandString("", {
       label: labels.concat([
         `${this.label_names['remote-job-dir']}=${remote_params['remote-job-dir']}`,
         `${this.label_names['project-id']}=${remote_params['project-id']}`
       ]),
       port: ports
      }
     )

    // -- execute ssh command --------------------------------------------------
    const ssh_options:Dictionary = {interactive: true}
    return this.ssh_shell.exec(cjr_command, {},[], {ssh: ssh_options})
  }

  // gets labels for all remote jobs whose id matches with the job_id string
  // label_flag - flags that will be passed to the underlying cjr job:label command.
  //              The flags --json and -label=job_info_label cannot be overridden
  // job_id:string (optional) any characters that need to match with job idea

  private getJobLabels(job_ids:Array<string> = [])
  {
    // -- read job data and extract job directories ----------------------------
    var result = this.ssh_shell.output(
      'cjr job:labels',
      {json: {}},
      job_ids,
      {},
      'json'
    )
    if(!result.success) // exit if json did not pass validation
      return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.LABEL.INVALID_JSON])

    const label_data = result.data
    if(job_ids.length > 0 && label_data === {}) // exit if user specified an id but there are no matching jobs
      return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.NO_MATCHING_ID])

    return new ValidatedOutput(true, label_data)
  }

  // PULLRSYNCCONFIG pulls rsync include and exclude files from a remote stack
  // folder. This function assumes the stack was bundled properly.
  private pullRsyncConfig(remote_stack_path: string, verbose: boolean)
  {
    // -- create a temp directory ----------------------------------------------
    var result = FileTools.mktempDir(path.join(this.storage_directory, remote_stack_rsync_config_dirname))
    if(!result.success) return result
    const local_tmp_dir:string = result.data
    // -- rsync download include and exclude files to local --------------------
    const flags:Dictionary = {
      a: {},
      include: [
        stack_bundle_rsync_file_paths['download']['include'],
        stack_bundle_rsync_file_paths['download']['exclude']
      ],
      exclude: '*'
    }
    if(verbose) flags['v'] = {}
    result = this.ssh_shell.rsync(
      local_tmp_dir,
      FileTools.addTrailingSeparator(remote_stack_path),
      'pull',
      flags
    )
    if(!result.success) return result
    // -- package results (only include existing files) ------------------------
    const rsync_files_flag:Dictionary = {}
    const local_include_file = path.join(local_tmp_dir, stack_bundle_rsync_file_paths['download']['include'])
    if(fs.existsSync(local_include_file)) rsync_files_flag['include-from'] = local_include_file
    const local_exclude_file = path.join(local_tmp_dir, stack_bundle_rsync_file_paths['download']['include'])
    if(fs.existsSync(local_exclude_file)) rsync_files_flag['exclude-from'] = local_exclude_file
    return new ValidatedOutput(true, {
      rsync_files_flag: rsync_files_flag,
      local_tmp_dir: local_tmp_dir
    })
  }

  private getFileUploadDirectories(resource: Resource, params:{'file-upload-mode': 'cached'|'uncached', 'local-project-root': string, 'project-id':string})
  {
    const remote_storage_dir = remoteStoragePath(resource['storage-dir'])
    const remoteProjectRoot = (remote_job_dir:string) =>
      (params['local-project-root']) ?
        path.posix.join(remote_job_dir, 'files', path.basename(params['local-project-root'])) :
        ""

    var result: ValidatedOutput
    var remote_job_dir: string
    if(params["file-upload-mode"] == "uncached")
    {
      result = this.mkTempDir(remote_storage_dir, ['files'], false)
      if(!result.success) return result
      remote_job_dir = result.data
    }
    else if(params["file-upload-mode"] == "cached")
    {
      result = this.mkDirs(remote_storage_dir, [`${params['project-id']}/files`], false)
      if(!result.success) return result
      remote_job_dir = path.posix.join(result.data, params['project-id'])
    }
    else
    {
      return new ValidatedOutput(false) // invalid options where passed
    }

    return new ValidatedOutput(true, {
        "remote-job-dir": remote_job_dir,
        "remote-project-root": remoteProjectRoot(remote_job_dir)
    })
  }

  private getStackUploadDirectories(resource: Resource, params:{'stack-upload-mode': 'cached'|'uncached', 'local-stack-name': string, 'project-id':string, 'parent-remote-job-dir'?:string})
  {
    const namedStack = (stack_dir:string) => path.posix.join(stack_dir, params['local-stack-name'])
    const remote_storage_dir = remoteStoragePath(resource['storage-dir'])

    var result: ValidatedOutput
    var stack_dir: string
    if(params["stack-upload-mode"] == "cached") // upload into project_id
    {
      result = this.mkDirs(remote_storage_dir, [`${params['project-id']}`], false)
      if(!result.success) return result
      stack_dir = path.posix.join(result.data, params['project-id'])
      return new ValidatedOutput(true, namedStack(stack_dir))
    }
    else if(params["stack-upload-mode"] == "uncached")
    {
      // -- create new tmp directory -------------------------------------------
      if(params['parent-remote-job-dir'])
        result = this.mkTempDir(path.posix.join(params['parent-remote-job-dir'], '.exec-stacks'), [], false) // used by exec, shell, jupyter
      else
        result = this.mkTempDir(remote_storage_dir, ['files'], false)
      if(!result.success) return result
      return new ValidatedOutput(true, result.data) // store stack directly in tmp directory
    }
    else
    {
      return new ValidatedOutput(false, '') // invalid parameters passed
    }
  }

  private getUploadDirectories(resource: Resource, params:{'stack-upload-mode': 'cached'|'uncached', 'local-stack-name': string, 'local-project-root': string, 'project-id':string, 'file-upload-mode': 'cached'|'uncached'})
  {
    if(!params['project-id']) return new ValidatedOutput(false)

    var result: ValidatedOutput
    result = this.getFileUploadDirectories(resource, {
      'project-id':         params['project-id'],
      'local-project-root': params['local-project-root'],
      'file-upload-mode':   params['file-upload-mode']
    })
    if(!result.success) return result
    const directories:Dictionary = result.data

    // if both stack and files are set to cache store both in same tmp directory
    if(params['file-upload-mode'] == 'uncached' && params['stack-upload-mode'] == 'uncached')
    {
      directories['remote-stack-path'] = path.posix.join(directories['remote-job-dir'], params['local-stack-name'])
    }
    else // -- otherwise compute paths regularly -------------------------------
    {
      result = this.getStackUploadDirectories(resource, {
        'project-id':         params['project-id'],
        'local-stack-name':   params['local-stack-name'],
        'stack-upload-mode':  params['stack-upload-mode']
      })
      if(!result.success) return result
      directories['remote-stack-path'] = result.data
    }

    return new ValidatedOutput(true, directories)
  }

  // helper function for early exits

  private stopMultiplexMasterAndReturn(x:ValidatedOutput)
  {
    if(this.multiplex_options.autodisconnect)
      this.ssh_shell.multiplexStop();
    return x
  }

  private initConnection(resource: Resource, options: Dictionary = {})
  {
    if(this.multiplex_options.autoconnect)
      return this.connect(resource)
    else
      return this.ssh_shell.setResource(resource)
  }

  disconnect(resource: Resource, options: Dictionary = {})
  {
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    else return new ValidatedOutput(this.ssh_shell.multiplexStop())
  }

  connect(resource: Resource, options: Dictionary = {})
  {
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result

    if(this.multiplex_options['restart-existing-connection'] && this.ssh_shell.multiplexExists()) {
      this.ssh_shell.multiplexStop()
    }
    return new ValidatedOutput(this.ssh_shell.multiplexStart(options))
  }

}
