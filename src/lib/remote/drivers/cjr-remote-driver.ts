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
import {ensureProjectId, containerWorkingDir, promptUserId, getProjectId} from '../../functions/run-functions'
import {printResultState} from '../../functions/misc-functions'
import {ErrorStrings, WarningStrings, StatusStrings} from '../error-strings'

type Dictionary = {[key: string]: any}

export class CJRRemoteDriver extends RemoteDriver
{

  private interactive_ssh_options = {ssh: {interactive: true}}
  private transferrable_flags = { // displays the flags that will be passed to remote cjr commands. All other flags are ignored
     'job:attach' : ['explicit'],
     'job:copy'   : ['explicit', 'verbose', 'all'],
     'job:delete' : ['explicit', 'all', 'all-completed', 'all-running', 'silent'],
     'job:labels' : ['all', 'all-completed', 'all-running', 'silent'],
     'job:list'   : ['explicit', 'verbose', 'json', 'all'],
     'job:log'    : ['explicit', 'lines'],
     'job:stop'   : ['explicit', 'all', 'all-completed', 'all-running', 'silent'],
     'job:shell'  : ['explicit', 'discard'],
     '$'          : ['explicit', 'async', 'verbose', 'silent', 'port', 'x11', 'autocopy', 'autocopy-all']
  }
  private ssh_shell: SshShellCommand

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
    if(!args.id) return new ValidatedOutput(false, [], [ErrorStrings.COPYJOB.EMPTY_ID])
    // -- do not copy if there is no local hostRoot set ------------------------
    if(!flags.hostRoot) return new ValidatedOutput(false, [], [ErrorStrings.COPYJOB.EMPTY_LOCAL_HOSTROOT])
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart()

    // == 1. read json job data ================================================
    this.printStatus(StatusStrings.COPYJOB.READING_JOBINFO, this.output_flags.verbose)
    result = this.getJobInfo({}, args.id, (x:any) => {return {hostRoot: x?.hostRoot, resultPaths: x?.resultPaths}})
    if(!result.success) return this.stopMultiplexAndReturn(result)

    const matching_ids = Object.keys(result.data)
    if(matching_ids.length == 0) return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.COPYJOB.NO_MATCHING_ID]))
    const job_id = matching_ids[0]
    const job_data = result.data[job_id]
    // -- exit with warning if remote job has not hostRoot ---------------------
    if(!job_data.hostRoot) return this.stopMultiplexAndReturn(new ValidatedOutput(true, [], [WarningStrings.COPYJOB.EMPTY_REMOTE_HOSTROOT], []))

    // == 2. verify remote project matches with local project  =================
    if(!flags["force"])
    {
      var remote_job_path = path.posix.dirname(path.posix.dirname(job_data.hostRoot))
      var result = this.ssh_shell.output(`cat`, {}, [path.posix.join(remote_job_path,project_idfile)], {}, 'json')
      if(!result.success) return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.COPYJOB.UNREADABLE_PROJECT_ID]))
      const remote_project_id = result.data

      result = getProjectId(flags.hostRoot)
      const local_project_id = (result.success) ? result.data : false;
      // verify matching project ids
      if(remote_project_id != local_project_id) {
        return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.COPYJOB.DIFFERING_PROJECT_ID]))
      }
      // verify matching project hostRoot names
      if(path.basename(flags.hostRoot) != path.posix.basename(job_data.hostRoot)) {
        return this.stopMultiplexAndReturn(new ValidatedOutput(false, [], [ErrorStrings.COPYJOB.DIFFERING_PROJECT_DIRNAME]))
      }
    }
    this.printStatus(StatusStrings.DONE, true)

    // == 3. Call Remote COPY ==================================================
    result = this.ssh_shell.exec(
      'cjr job:copy',
      this.cliFlagsToShellFlags(flags,this.transferrable_flags['job:copy']),
      [job_id],
      this.interactive_ssh_options
    )
    if(!result.success) return this.stopMultiplexAndReturn(result)

    // == 4. Copy Directories ==================================================
    this.printStatus(StatusStrings.COPYJOB.DOWNLOADING_FILES, this.output_flags.verbose)
    result = this.pullProjectFiles(flags.hostRoot, job_data.hostRoot, job_data.resultPaths || [], flags.all || false)
    this.printStatus(StatusStrings.DONE, true)

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
    if(!args.id && !flags.all && !flags['all-completed'] && !flags['all-running'])
      return new ValidatedOutput(false, [], [ErrorStrings.DELETEJOB.EMPTY_ID])
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart()

    // -- 1. read job data and extract job directories -------------------------
    result = this.getJobInfo(flags, args.id || "", (x:any) => (x?.hostRoot) ? path.posix.dirname(path.posix.dirname(x.hostRoot)) : "") // project directory is two levels up from hostRoot (see jobStart)
    if(!result.success) return this.stopMultiplexAndReturn(result)
    printResultState(result) // print any warnings from getRemoteRunDirectories
    // -- 2. ensure that paths contain remote_job_dir --------------------------
    const job_info_all: {[key: string]: string} = result.data
    const remote_dirs = Object.values(job_info_all).filter((dir:string) => (new RegExp(`/${path.posix.basename(resource['storage-dir'])}/`)).test(dir))
    // -- 3. run cjr:delete ----------------------------------------------------
    result = this.ssh_shell.exec(
      'cjr job:delete',
      this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:delete']),
      (args.id) ? [args.id] : [],
      this.interactive_ssh_options
    )
    if(!result.success) return this.stopMultiplexAndReturn(result)
    // -- 5. Delete Data Directories -------------------------------------------
    if(remote_dirs.length > 0)
      result = this.ssh_shell.exec('rm', {r: {}}, [ ... new Set(remote_dirs)])
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
    if(!args.id) return new ValidatedOutput(false, [], [ErrorStrings.SHELLJOB.EMPTY_ID])
    const job_id = args.id
    // -- load stack -----------------------------------------------------------
    result = this.loadAndBundleConfiguration(builder, stack_path, overloaded_config_paths)
    if(!result.success) return result
    printResultState(result) // print any warnings from bundling
    const {configuration, bundled_configuration_raw_object} = result.data
    // -- start ssh master -----------------------------------------------------
    this.ssh_shell.multiplexStart()
    // -- create remote tmp directory for job ----------------------------------
    result = this.mkTempDir(resource['storage-dir'], ['files'], false)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    const remote_job_path = result.data
    // -- copy stack -----------------------------------------------------------
    this.printStatus(StatusStrings.STARTJOB.UPLOADING_STACK, this.output_flags.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    const remote_stack_path = path.posix.join(remote_job_path, `${job_id}-${builder.stackName(stack_path)}`)
    result = this.pushStack(builder, stack_path, remote_stack_path, bundled_configuration_raw_object)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.DONE, true)
    // -- execute cjr job:shell command ----------------------------------------
    result = this.ssh_shell.exec(
      'cjr job:shell',
      { ...this.cliFlagsToShellFlags(flags, this.transferrable_flags['job:shell']), ...{stack: remote_stack_path}},
      (job_id) ? [job_id] : [],
      this.interactive_ssh_options
    )
    // -- stop ssh master -----------------------------------------------------
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
    result = this.mkTempDir(resource['storage-dir'], ['files'], false)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    const remote_job_path = result.data
    // -- copy stack -----------------------------------------------------------
    this.printStatus(StatusStrings.STARTJOB.UPLOADING_STACK, this.output_flags.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    const remote_stack_path = path.posix.join(remote_job_path, `${path.posix.basename(remote_job_path)}-${builder.stackName(stack_path)}`)
    result = this.pushStack(builder, stack_path, remote_stack_path, bundled_configuration_raw_object)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.DONE, true)
    // -- copy files & project id ----------------------------------------------
    this.printStatus(StatusStrings.STARTJOB.UPLOADING_FILES, this.output_flags.verbose) // Note: if verbose print extra line if verbose or scp gobbles line
    result = this.pushProjectFiles(host_root, path.posix.join(remote_job_path, 'files'))
    if(!result.success) return this.stopMultiplexAndReturn(result);
    result = this.pushProjectId(host_root, remote_job_path)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.DONE, true)
    // -- start job ------------------------------------------------------------
    const remote_hostRoot = (host_root) ? path.posix.join(remote_job_path, 'files', path.posix.basename(host_root)) : ""
    this.printStatus(StatusStrings.STARTJOB.RUNNING_JOB, true)
    result = this.CJRJobStart(remote_stack_path, remote_hostRoot, flags, argv)
    if(!result.success) return this.stopMultiplexAndReturn(result);
    this.printStatus(StatusStrings.DONE, true)
    // -- autocopy  ------------------------------------------------------------
    if(flags["autocopy"] || flags["autocopy-all"]) {
      this.printStatus(StatusStrings.STARTJOB.DOWNLOADING_FILES, this.output_flags.verbose)
      result = this.pullProjectFiles(host_root, remote_hostRoot, configuration.getResultPaths() || [], flags["autocopy-all"] || false)
      this.printStatus(StatusStrings.DONE, true)
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
     if(this.output_flags.verbose) console.log(StatusStrings.COPYJOB.SCP_DOWNLOAD(i+1, t.remote, t.local))
     return this.ssh_shell.scp(t.local, t.remote, "pull", this.scpShellOptions())
   })
   // -- validate each copy result --------------------------------------------
   return results.reduce((accumulator:ValidatedOutput, currentValue:ValidatedOutput) => {
     accumulator.success = accumulator.success && currentValue.success
     accumulator.error.concat(currentValue.error)
     return accumulator
   }, new ValidatedOutput(true))
  }

  private CJRJobStart(remote_stack_path: string, remote_hostroot: string, flags: Dictionary, argv: Array<string>)
  {
    const cjr_flags:Dictionary = this.cliFlagsToShellFlags(flags, this.transferrable_flags['$'])
    if(remote_hostroot) cjr_flags.hostRoot = remote_hostroot
    cjr_flags.stack = remote_stack_path
    cjr_flags["no-autoload"] = {}
    const cjr_command = this.ssh_shell.shell.commandString('cjr $', cjr_flags, argv)
    // -- 3.2 set appropriate working dir on remote ----------------------------
    const remote_wd = containerWorkingDir(process.cwd(), flags.hostRoot, path.posix.dirname(remote_hostroot))
    // -- execute ssh command ---------------------------------------------------
    const ssh_command = (remote_wd) ? `cd ${ShellCommand.bashEscape(remote_wd)} && ${cjr_command}` : cjr_command
    const ssh_options:Dictionary = {interactive: true}
    if(flags.x11) ssh_options.x11 = true
    return this.ssh_shell.exec(ssh_command, {},[], {ssh: ssh_options})
  }

  // gets info label for all remote jobs whose id matches with the job_id string
  // label_flag - flags that will be passed to the underlying cjr job:label command.
  //              The flags --json and -label=job_info_label cannot be overridden
  // job_id:string (optional) any characters that need to match with job idea
  // f: (x:any) => any - an optional function that can be used to process the job_info label
  private getJobInfo(label_flags: Dictionary, job_id:string = "", f:(x:any) => any = (x) => x) {
    // -- read job data and extract job directories ----------------------------
    const user_flags = this.cliFlagsToShellFlags(label_flags, this.transferrable_flags['job:labels'])
    var result = this.ssh_shell.output(
      'cjr job:labels',
      { ...user_flags, ...{json: {}, label: job_info_label}},
      (job_id) ? [job_id] : [],
      {},
      'json'
    )
    if(!result.success) // exit if json did not pass validation
      return new ValidatedOutput(false, [], [ErrorStrings.DELETEJOB.INVALID_JOB_DATA])

    const label_data = result.data
    if(job_id && label_data === {}) // exit if user specified and and there are no matching jobs
      return new ValidatedOutput(false, [], [ErrorStrings.DELETEJOB.NO_MATCHING_ID])

    result = new ValidatedOutput(true, {})
    const remote_dirs = []
    Object.keys(label_data).map((job_id:string) => {
      try {
        result.data[job_id] = f(JSON.parse(label_data[job_id]))
      }
      catch (e) {
        result.pushWarning(WarningStrings.DELETEJOB.INVALID_JOB_LABEL(job_id))
      }
    })
    return result
  }

  // helper function for early exits
  private stopMultiplexAndReturn(x:ValidatedOutput)
  {
    this.ssh_shell.multiplexStop();
    return x
  }

}
