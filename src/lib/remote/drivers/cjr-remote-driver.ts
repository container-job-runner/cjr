import * as path from 'path'
import * as fs from 'fs-extra'
import {ValidatedOutput} from "../../validated-output"
import {JSTools} from "../../js-tools"
import {ShellCommand} from "../../shell-command"
import {SshShellCommand} from "../ssh-shell-command"
import {FileTools} from "../../fileio/file-tools"
import {BuildDriver} from "../../drivers/abstract/build-driver"
import {RemoteDriver} from "./remote-driver"
import {cli_bundle_dir_name, projectIDPath, project_idfile, job_info_label} from '../../constants'
import {remote_storage_basename, remoteStoragePath} from '../constants'
import {ensureProjectId, containerWorkingDir, promptUserId, getProjectId} from '../../functions/run-functions'
import {printResultState} from '../../functions/misc-functions'
import {ErrorStrings, WarningStrings, StatusStrings} from '../error-strings'

type Dictionary = {[key: string]: any}
type RemoteJobParams = {
  remoteDir: string, // path  that contains all job data
  hostRoot: string,  // path to hostRoot
  stackPath: string, // path to stack
  projectId: string, // id of project that started job
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
     '$'          : ['explicit', 'async', 'verbose', 'silent', 'port', 'x11', 'autocopy', 'autocopy-all']
  }
  private ssh_shell: SshShellCommand
  private labels = {remoteDir: 'remoteDir', projectId: 'projectId'}
  private remoteStackName = (remote_job_path: string, stack_name: string) => `${path.posix.basename(remote_job_path)}-${stack_name}`
  private remoteStackPath = (remote_job_path: string, stack_name: string) => path.posix.join(remote_job_path, this.remoteStackName(remote_job_path, stack_name))

  constructor(ssh_shell: SshShellCommand, verbose:boolean, silent:boolean, oclif_config: Dictionary)
  {
    super(verbose, silent, oclif_config);
    this.ssh_shell = ssh_shell
  }

  jobAttach(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- execute ssh command --------------------------------------------------
    return this.ssh_shell.exec(
      'cjr job:attach',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:list']),
      (args.id) ? [args.id] : [],
      this.interactive_ssh_options
    )
  }

  jobCopy(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- validate parameters --------------------------------------------------
    if(!args.id) return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.EMPTY_ID])
    // -- do not copy if there is no local hostRoot set ------------------------
    if(!flags.hostRoot) return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.COPY.EMPTY_LOCAL_HOSTROOT])
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart()

    // == 1. read json job data ================================================
    this.printStatus(StatusStrings.REMOTEJOB.COPY.READING_JOBINFO, this.output_flags.verbose)
    result = this.getJobLabels({}, [args.id])
    if(!result.success) return this.stopMultiplexAndReturn(result)
    const all_job_labels = result.data

    const matching_ids = Object.keys(result.data)
    if(matching_ids.length == 0) return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.NO_MATCHING_ID]))

    // extract information for first job
    const job_id = matching_ids[0]
    const job_labels = all_job_labels[job_id]
    const remote_hostRoot = job_labels?.[job_info_label]?.hostRoot || ""
    const resultPaths = job_labels?.[job_info_label]?.resultPaths || ""
    const remote_project_id = job_labels?.projectId || ""

    // -- exit with warning if remote job has not hostRoot ---------------------
    if(!remote_hostRoot) return this.stopMultiplexAndReturn(new ValidatedOutput(true, [], [WarningStrings.REMOTEJOB.COPY.EMPTY_REMOTE_HOSTROOT], []))

    // == 2. verify remote project matches with local project  =================
    if(!flags["force"])
    {
      // -- read local project id file -----------------------------------------
      result = getProjectId(flags.hostRoot)
      const local_project_id = (result.success) ? result.data : false;
      // verify matching project ids
      if(remote_project_id != local_project_id) {
        return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.COPY.DIFFERING_PROJECT_ID]))
      }
      // verify matching project hostRoot names
      if(path.basename(flags.hostRoot) != path.posix.basename(remote_hostRoot)) {
        return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.COPY.DIFFERING_PROJECT_DIRNAME]))
      }
    }
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)

    // == 3. Call Remote COPY ==================================================
    result = this.ssh_shell.exec(
      'cjr job:copy',
      this.cliFlagsToShellFlags(flags,this.transferrable_flags['job:copy']),
      [job_id],
      this.interactive_ssh_options
    )
    if(!result.success) return this.stopMultiplexAndReturn(result)

    // == 4. Copy Directories ==================================================
    this.printStatus(StatusStrings.REMOTEJOB.COPY.DOWNLOADING_FILES, this.output_flags.verbose)
    result = this.pullProjectFiles(flags.hostRoot, remote_hostRoot, resultPaths || [], flags.all || false)
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)

    // -- stop ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStop()
    return result
  }

  jobDelete(resource: Dictionary, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- validate parameters -----------------------------------------------
    if(argv.length == 0 && !flags.all && !flags['all-completed'] && !flags['all-running'])
      return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.EMPTY_ID])
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart()

    // -- 1. read job info and extract job stacks & job directories ------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.READING_JOBINFO, this.output_flags.verbose)
    result = this.getJobLabels(flags, argv)
    if(!result.success) return this.stopMultiplexAndReturn(result)
    printResultState(result) // print any warnings from getJobLabels
    const all_job_labels = result.data
    if(Object.keys(all_job_labels).length == 0) return this.stopMultiplexAndReturn(new ValidatedOutput(true, [], [], [WarningStrings.REMOTEJOB.DELETE.NO_MATCHING_JOBS])) // no jobs to delete
    // -- 2. filter out jobs where Remote path does not contain remote_job_dir -
    const job_labels = JSTools.oSubset(
      all_job_labels,
      Object.keys(all_job_labels).filter(
        (id:string) => (new RegExp(`/${remote_storage_basename}/`)).test(all_job_labels[id]?.remoteDir || "")
    ))
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- 3. run cjr:delete ----------------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.JOBS, this.output_flags.verbose)
    const job_ids = Object.keys(job_labels)
    if(job_ids.length == 0) return this.stopMultiplexAndReturn(new ValidatedOutput(true, [], [], [WarningStrings.REMOTEJOB.DELETE.NO_MATCHING_REMOTEJOBS])) // no jobs to delete
    result = this.ssh_shell.exec(
      'cjr job:delete',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:delete']),
      job_ids,
      this.interactive_ssh_options
    )
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- 4. run cjr:rmi for associated image ----------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.IMAGES, this.output_flags.verbose)
    const job_stack_names  = job_ids.map((id:string) => path.posix.join(job_labels[id].remoteDir, job_labels[id].stack))
    result = this.ssh_shell.exec(
      'cjr stack:rmi',
      {},
      job_stack_names,
      this.interactive_ssh_options
    )
    if(!result.success) return this.stopMultiplexAndReturn(result)
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- 5. Delete Data Directories -------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.DELETE.REMOTE_DIRECTORIES, this.output_flags.verbose)
    const job_remote_paths = job_ids.map((id:string) => job_labels[id].remoteDir)
    result = this.ssh_shell.exec('rm', {r: {}}, [ ... new Set(job_remote_paths)])  // [ .. new Set(Array<string>)]  gives unique values only
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    return this.stopMultiplexAndReturn(result)
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

  jobShell(resource: Dictionary, builder: BuildDriver, stack_path: string, overloaded_config_paths: Array<string>, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- validate parameters -----------------------------------------------
    if(!args.id) return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.EMPTY_ID])
    // -- load stack -----------------------------------------------------------
    result = this.loadAndBundleConfiguration(builder, stack_path, overloaded_config_paths)
    if(!result.success) return result
    printResultState(result) // print any warnings from bundling
    const {configuration, bundled_configuration_raw_object} = result.data
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart()
    // -- read json job data to extract projectid ==============================
    this.printStatus(StatusStrings.REMOTEJOB.SHELL.READING_JOBINFO, this.output_flags.verbose)
    result = this.getJobLabels({}, [args.id])
    if(!result.success) return this.stopMultiplexAndReturn(result)
    const matching_ids = Object.keys(result.data)
    if(matching_ids.length == 0) return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.NO_MATCHING_ID]))
    const job_id = matching_ids[0]
    const project_id = result.data[job_id]?.[this.labels.projectId]
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)

    // -- create remote tmp directory for job ----------------------------------
    result = this.mkTempDir(remoteStoragePath(resource['storage-dir']), ['files'], false)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    const remote_job_path = result.data
    // -- copy stack -----------------------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.SHELL.UPLOADING_STACK, this.output_flags.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    const remote_stack_path = this.remoteStackPath(remote_job_path, builder.stackName(stack_path))
    result = this.pushStack(builder, stack_path, remote_stack_path, bundled_configuration_raw_object)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- execute cjr job:shell command ----------------------------------------
    const cjr_command = this.ssh_shell.shell.commandString(
      'cjr job:shell',
      { ...this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:shell']), ...{stack: remote_stack_path}},
      (job_id) ? [job_id] : [],
      this.interactive_ssh_options
    ) + this.ssh_shell.shell.commandString('', {
      'label': [
        `${this.labels.remoteDir}=${remote_job_path}`,
        `${this.labels.projectId}=${project_id}`
      ]
    }) // NOTE: append --label flag due to OCLIF BUG (https://github.com/oclif/oclif/issues/190)
    result = this.ssh_shell.exec(cjr_command, {}, [], this.interactive_ssh_options)
    // -- stop ssh master ------------------------------------------------------
    return this.stopMultiplexAndReturn(result);
  }

  jobStart(resource: Dictionary, builder: BuildDriver, stack_path: string, overloaded_config_paths: Array<string>, flags: Dictionary, args: Dictionary, argv: Array<string>)
  {
    const host_root = flags?.hostRoot || ""
    // -- set resource ---------------------------------------------------------
    var result = this.ssh_shell.setResource(resource)
    if(!result.success) return result
    // -- load stack -----------------------------------------------------------
    result = this.loadAndBundleConfiguration(builder, stack_path, overloaded_config_paths)
    if(!result.success) return result
    printResultState(result) // print any warnings from bundling
    const {configuration, bundled_configuration_raw_object} = result.data
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart({x11: flags?.x11})
    // -- ensure project has ID ------------------------------------------------
    if(host_root) result = ensureProjectId(host_root)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    const project_id = result.data
    // -- create remote tmp directory for job ----------------------------------
    result = this.mkTempDir(remoteStoragePath(resource['storage-dir']), ['files'], false)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    const remote_job_path = result.data
    // -- copy stack -----------------------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.UPLOADING_STACK, this.output_flags.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    const remote_stack_path = this.remoteStackPath(remote_job_path, builder.stackName(stack_path))
    result = this.pushStack(builder, stack_path, remote_stack_path, bundled_configuration_raw_object)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- copy files & project id ----------------------------------------------
    this.printStatus(StatusStrings.REMOTEJOB.START.UPLOADING_FILES, this.output_flags.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    result = this.pushProjectFiles(host_root, path.posix.join(remote_job_path, 'files'))
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- start job ------------------------------------------------------------
    const remote_hostRoot = (host_root) ? path.posix.join(remote_job_path, 'files', path.posix.basename(host_root)) : ""
    this.printStatus((flags.async) ? StatusStrings.REMOTEJOB.START.STARTING_JOB : StatusStrings.REMOTEJOB.START.RUNNING_JOB, true)
    result = this.CJRJobStart({
        remoteDir: remote_job_path,   // path  that contains all job data
        hostRoot:  remote_hostRoot,   // path to hostRoot
        stackPath: remote_stack_path, // path to stack
        projectId: project_id,        // id of project that started job
      }, flags, argv)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    // -- autocopy  ------------------------------------------------------------
    if(flags["autocopy"] || flags["autocopy-all"]) {
      this.printStatus(StatusStrings.REMOTEJOB.START.DOWNLOADING_FILES, this.output_flags.verbose)
      result = this.pullProjectFiles(host_root, remote_hostRoot, configuration.getResultPaths() || [], flags["autocopy-all"] || false)
      this.printStatus(StatusStrings.REMOTEJOB.DONE, true)
    }
    return this.stopMultiplexAndReturn(result);
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
    return await promptUserId(result.data)
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
   if(this.output_flags.silent) return
   if(newline) console.log(message)
   else process.stdout.write(message)
  }

  private scpShellOptions(){
   return (this.output_flags.verbose) ? {} : {stdio:'ignore'}
  }

  // -- Core Remote Functions --------------------------------------------------

  private loadAndBundleConfiguration(builder:BuildDriver, stack_path: string, overloaded_config_paths: Array<string>)
  {
   var result = builder.loadConfiguration(stack_path, overloaded_config_paths)
   if(!result.success) return result;
   const configuration = result.data

   result = configuration.bundle(stack_path)
   if(!result.success) return result;
   result.data = {configuration: configuration, bundled_configuration_raw_object: result.data}
   return result
  }

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

  // PUSHSTACK: copies a stack to remote resource inside specified parent folder.
  // builder - BuildDriver for building stack
  // stack_path: path on local machine where stack is located
  // configuration: Dictionary - result from stack configuration.bundle()
  private pushStack(builder:BuildDriver, stack_path: string, remote_cp_path: string, configuration: Dictionary|boolean=false)
  {
  // -- 1. copy stack into a local tmp directory ------------------------------
  var result = FileTools.mktempDir(
    path.join(this.config.dataDir, cli_bundle_dir_name),
    this.ssh_shell.shell)
   if(!result.success) return result;
   const temp_stack_path = result.data

   result = builder.copy(stack_path, temp_stack_path, configuration)
   if(!result.success) return result;

   // -- 2. transfer stack over scp --------------------------------------------
   result = this.ssh_shell.scp(temp_stack_path, remote_cp_path, 'push', this.scpShellOptions())
   if(!result.success) return result;

   // -- 3. remove local tml directory -----------------------------------------
   fs.remove(temp_stack_path)
   return result
  }

  // scp project files remote resource
  private pushProjectFiles(host_root: string, remote_cp_path: string)
  {
   if(!host_root) return new ValidatedOutput(true) // projects with no hostRoot do not require copy
   return this.ssh_shell.scp(host_root, remote_cp_path, 'push', this.scpShellOptions())
  }

  // scp project id to remote resource
  private pushProjectId(host_root: string, remote_cp_path: string)
  {
   if(!host_root) return new ValidatedOutput(true) // projects with no hostRoot do not require copy
   // -- push project ID -------------------------------------------------------
   return this.ssh_shell.scp(
     projectIDPath(host_root),
     path.posix.join(remote_cp_path, project_idfile),
     'push',
     this.scpShellOptions()
   )
  }

  private pullProjectFiles(local_hostRoot:string, remote_hostRoot: string, remote_resultPaths: Array<string>=[], copy_all: boolean)
  {
   if(!local_hostRoot) return new ValidatedOutput(true) // projects with no hostRoot do not require copy
   // -- select function for computing local copy paths -----------------------
   var local_path: (result_path: string) => string
   // ----> case 1: remote and local project folder match ---------------------
   if(path.basename(local_hostRoot) === path.posix.basename(remote_hostRoot))
     local_path = (result_path: string) => path.dirname(path.join(local_hostRoot, result_path))
   else // ----> case 2: remote and local project folder names do not match ---
     local_path = (result_path: string) => (result_path) ? path.dirname(path.join(local_hostRoot, result_path)) : local_hostRoot

   // -- compute scp paths ----------------------------------------------------
   if(remote_resultPaths.length == 0 || copy_all) remote_resultPaths = [""]

   const scp_paths:Array<Dictionary> = remote_resultPaths.map((result_path:string) => {
       return {
         remote: path.posix.join(remote_hostRoot, result_path),
         local:  local_path(result_path)
       }
     })

   // -- scp files ------------------------------------------------------------
   const results = scp_paths.map((t:Dictionary, i:number) => {
     if(this.output_flags.verbose) console.log(StatusStrings.REMOTEJOB.FILES.SCP_DOWNLOAD(i+1, t.remote, t.local))
     return this.ssh_shell.scp(t.local, t.remote, "pull", this.scpShellOptions())
   })
   // -- validate each copy result --------------------------------------------
   return results.reduce((accumulator:ValidatedOutput, currentValue:ValidatedOutput) => {
     accumulator.success = accumulator.success && currentValue.success
     accumulator.error.concat(currentValue.error)
     return accumulator
   }, new ValidatedOutput(true))
  }

  private CJRJobStart(job_params:RemoteJobParams, flags: Dictionary, argv: Array<string>)
  {
    const cjr_flags:Dictionary = this.cliFlagsToShellFlags(flags, this.transferrable_flags['$'])
    if(job_params.hostRoot) cjr_flags.hostRoot = job_params.hostRoot
    cjr_flags.stack = job_params.stackPath
    cjr_flags["no-autoload"] = {}
    // Note: OCLIF does not support flags with multiple values before args
    //       (https://github.com/oclif/oclif/issues/190). Therefore we must
    //       manually append the --label flag at end of the cjr command.
    const cjr_command = this.ssh_shell.shell.commandString('cjr $', cjr_flags, argv)
     + this.ssh_shell.shell.commandString("", {
       label: [
         `${this.labels.remoteDir}=${job_params.remoteDir}`,
         `${this.labels.projectId}=${job_params.projectId}`
       ]}
     )
    // -- set appropriate working dir on remote --------------------------------
    const remote_wd = containerWorkingDir(process.cwd(), flags.hostRoot, path.posix.dirname(job_params.hostRoot))
    // -- execute ssh command --------------------------------------------------
    const ssh_command = (remote_wd) ? `cd ${ShellCommand.bashEscape(remote_wd)} && ${cjr_command}` : cjr_command
    const ssh_options:Dictionary = {interactive: true}
    if(flags.x11) ssh_options.x11 = true
    return this.ssh_shell.exec(ssh_command, {},[], {ssh: ssh_options})
  }

  // gets labels for all remote jobs whose id matches with the job_id string
  // label_flag - flags that will be passed to the underlying cjr job:label command.
  //              The flags --json and -label=job_info_label cannot be overridden
  // job_id:string (optional) any characters that need to match with job idea

  private getJobLabels(label_flags: Dictionary, job_id:Array<string> = [])
  {
    // -- read job data and extract job directories ----------------------------
    const user_flags = this.cliFlagsToShellFlags(label_flags, this.transferrable_flags['job:labels'])
    var result = this.ssh_shell.output(
      'cjr job:labels',
      { ...user_flags, ...{json: {}}},
      job_id,
      {},
      'json'
    )
    if(!result.success) // exit if json did not pass validation
      return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.LABEL.INVALID_JSON])

    const label_data = result.data
    if(job_id && label_data === {}) // exit if user specified an id but there are no matching jobs
      return new ValidatedOutput(false, [], [ErrorStrings.REMOTEJOB.NO_MATCHING_ID])

    // parse job info data
    Object.keys(label_data).map((job_id:string) => {
      try {
        label_data[job_id][job_info_label] = JSON.parse(label_data[job_id]?.[job_info_label])
      }
      catch (e) {
        result.pushWarning(WarningStrings.REMOTEJOB.LABELS.INVALID_JOBINFO_JSON(job_id))
      }
    })
    return new ValidatedOutput(true, label_data)
  }

  // helper function for early exits
  private stopMultiplexAndReturn(x:ValidatedOutput)
  {
    this.ssh_shell.multiplexStop();
    return x
  }

}
