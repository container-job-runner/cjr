import chalk = require('chalk')
import { BasicCommand } from './basic-command'
import { updateStackConfig, updateJobConfig } from '../functions/config-functions'
import { ValidatedOutput } from '../validated-output'
import { JobRunOptions, JobExecOptions, JobManager } from '../job-managers/abstract/job-manager'
import { JobConfiguration } from '../config/jobs/job-configuration'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { NewJobInfo, firstJob } from '../drivers-containers/abstract/run-driver'
import { printValidatedOutput } from '../functions/misc-functions'
import { JSTools } from '../js-tools'
import { Dictionary } from '../constants'
import { LocalJobManager } from '../job-managers/local/local-job-manager'

// ===========================================================================
// NewJobCommand: An abstract Class for cli commands that start new jobs.
// Contains functions for converting cli flags into SDK Configurations
// ===========================================================================

export type CLIJobFlags = {
    "resource"?: string,
    "stack"?: string,
    "project-root"?: string,
    "here"?: boolean,
    "profile"?: Array<string>,
    "config-files": Array<string>,
    "explicit": boolean,
    "verbose": boolean,
    "quiet": boolean,
    "async"?: boolean,
    "sync"?: boolean,
    "port"?: Array<string>,
    "x11": boolean,
    "message"?: string,
    "label"?: Array<string>,
    "file-access"?: string,
    "build-mode":  string,
    "no-autoload": boolean,
    "stacks-dir": string,
    "working-directory": string
    "remove-on-exit"?: boolean
    "copy"?:boolean
    "no-copy"?:boolean
    "visible-stacks"?: Array<string>
}

type StackData = {
  "job_manager": JobManager  
  "stack_configuration": StackConfiguration<any>
}

type JobData = StackData & {
  "job_configuration": JobConfiguration<StackConfiguration<any>>,
}

export abstract class JobCommand extends BasicCommand
{

  // alters flags based on --here and local project settings
  augmentFlagsForJob(flags: CLIJobFlags)
  {
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {
      "resource": false,
      "stack": true,
      "profile": false,
      "project-root":false,
      "stacks-dir": false,
      "visible-stacks": false
    })
    this.augmentFlagsWithProfile(flags)
    this.printNonEmptyFlags(flags)
  }

  printNonEmptyFlags(flags: CLIJobFlags)
  {
    if(!flags.verbose)
      return

    const printable_flags = [
      "project-root",
      "stack",
      "stacks-dir",
      "working-directory",
      "build-mode",
      "config-files",
      "file-access",
      "port",
      "x11",
      "label",
      "auto-copy",
      "visible-stacks"
    ]
    console.log(chalk`-- {bold Job Flags} ${"-".repeat(67)}`)
    printable_flags.map( (name:string) => {
      if(!JSTools.isEmpty((flags as Dictionary)[name]))
        console.log(chalk`{italic ${name}}: ${(flags as Dictionary)[name]}`)
    })
  }

  // generates a StackConfiguration based on cli flags
  createStack(flags: CLIJobFlags) : ValidatedOutput<StackData>
  {
    // -- init Container SDK components ----------------------------------------
    const job_manager = this.newJobManager(
        flags["resource"] || "localhost", 
        {
            "verbose": flags["verbose"] || false,
            "quiet": flags["quiet"] || false,
            "explicit": flags["explicit"] || false
        }
    )
    // -- init stack configuration ---------------------------------------------
    const load = this.initStackConfiguration(flags, job_manager.configurations, job_manager.shell)
    const stack_configuration = load.value
    // -- set stack options ----------------------------------------------------
    updateStackConfig(stack_configuration, {
      "ports": this.parsePortFlag(flags?.port || []),
      "build-flags": this.extractBuildFlags(flags)
    });

    return new ValidatedOutput(true, {
      "stack_configuration": stack_configuration,
      "job_manager": job_manager
    }).absorb(load)
  }

  // generates jobConfiguration based on cli flags
  createJob(flags: CLIJobFlags, command: Array<string>) : ValidatedOutput<JobData>
  {
    // -- init Container SDK components ----------------------------------------
    const load = this.createStack(flags)
    const { stack_configuration, job_manager } = load.value
    // -- load run-shortcuts ---------------------------------------------------
    const run_shortcuts = this.newRunShortcuts()
    // -- set job options ------------------------------------------------------
    const job_configuration = job_manager.configurations.job(stack_configuration)
    const synchronous = flags['sync'] || (!flags['async'] && (this.settings.get('job-default-run-mode') == 'sync'))
    updateJobConfig(job_configuration, {
      "synchronous": synchronous,
      "command": run_shortcuts.apply(command),
      "labels": this.parseLabelFlag(flags.label || [], flags.message || ""),
      "remove-on-exit": flags?.['remove-on-exit'] || false
    })

    return new ValidatedOutput(true, {
      "job_configuration": job_configuration,
      "stack_configuration": stack_configuration,
      "job_manager": job_manager
    }).absorb(load)
  }

  // generates JobRunOptions based on cli flags
  runOptions(flags: CLIJobFlags): JobRunOptions
  {
    return {
        "reuse-image": this.extractReuseImage(flags),
        "project-root-file-access":  (flags['file-access'] as "volume"|"shared"),
        "project-root": flags["project-root"] || "",
        "x11": flags["x11"],
        "cwd": flags['working-directory']
      }
  }

  runSimpleJob(flags: CLIJobFlags, command: Array<string>) : {job: ValidatedOutput<NewJobInfo>, job_data: ValidatedOutput<JobData>}
  {
    const failure = new ValidatedOutput(false, {"id": "", "exit-code": NaN, "output": ""})
    // -- augment flags --------------------------------------------------------
    this.augmentFlagsForJob(flags)
    // -- initialize job data and exit if failed -------------------------------
    const job_data = this.createJob(flags, command)
    if(!job_data.success)
      return {"job": failure, "job_data": job_data}
    const {job_configuration, job_manager} = job_data.value
    // -- run basic job --------------------------------------------------------
    const job = job_manager.run(
      job_configuration,
      this.runOptions(flags)
    )
    if(this.shouldPrintJobId(job_manager, job, job_configuration.synchronous, flags))
        this.printJobId(job, job_configuration.synchronous)
    return {"job": job, "job_data": job_data}
  }

  runSimpleJobAndCopy(flags: CLIJobFlags, command: Array<string>) : {job: ValidatedOutput<NewJobInfo>, job_data: ValidatedOutput<JobData>}
  {
    const {job, job_data} = this.runSimpleJob(flags, command)
    const result = {"job": job, "job_data": job_data}

    if(!job.success || !job_data.success) return {"job": job, "job_data": job_data}
    // -- copy back results ----------------------------------------------------
    const { job_manager } = job_data.value
    const job_id = job.value.id
    if(this.shouldCopy(flags, job_manager, job_id))
      printValidatedOutput(
        job_manager.copy({
          "ids": [job_id],
          "mode": "update"
        })
      )
    return result

  }

  shouldCopy(flags: CLIJobFlags, job_manager: JobManager, job_id: string)
  {
    // -- check flag status ----------------------------------------------------
    if(!flags["project-root"]) return false
    if( (job_manager instanceof LocalJobManager) && (flags["file-access"] === 'shared') ) return false
    // -- check that job has stopped -------------------------------------------
    const result = firstJob(
        job_manager.list({
            "filter" : {"ids": [job_id], "states": ['exited']}
        })
    )
    if(!result.success) return false
    if(flags["no-copy"]) return false
    if(flags["copy"]) return true
    const synchronous = flags['sync'] || (!flags['async'] && (this.settings.get('job-default-run-mode') == 'sync'))
    if(synchronous && this.settings.get('autocopy-sync-job')) return true
    return false
  }

  private shouldPrintJobId(job_manager: JobManager, job: ValidatedOutput<NewJobInfo>, synchronous: boolean, flags: CLIJobFlags) : boolean
  {
    if (!job.success || flags.quiet || flags.verbose) 
        return false // no print if job failed, quiet flag active, or verbose flag is active (job manager already printed id)
    else if (!synchronous || this.settings.get('always-print-job-id')) 
        return true // always print for async jobs or if setting is active
    else if (synchronous && job_manager.state({ids: [job.value.id]}).value?.pop() == 'running') 
        return true // print if user detached from job.
    else
        return false
  }
  
  private printJobId(job: ValidatedOutput<NewJobInfo>, synchronous: boolean)
  {
    if (synchronous)
        console.log(chalk`-- {bold Job Id }${'-'.repeat(54)}\n${job.value.id}`) 
    else
        console.log(job.value.id)
  }

  // generates JobExecOptions based on cli flags
  execOptions(parent_id: string, flags: CLIJobFlags): JobExecOptions
  {
    return {
        "reuse-image": this.extractReuseImage(flags),
        "parent-id": parent_id,
        "x11": flags["x11"],
        "cwd": flags['working-directory'],
        "stack-paths": this.extractVisibleStacks(flags)
      }
  }

  runSimpleExec(parent_id: string, flags: CLIJobFlags, command: Array<string>) : {job: ValidatedOutput<NewJobInfo>, job_data: ValidatedOutput<JobData>}
  {
    const failure = new ValidatedOutput(false, {"id": "", "exit-code": NaN, "output": ""})
    // -- augment flags --------------------------------------------------------
    this.augmentFlagsForJob(flags)
    // -- initialize job data and exit if failed -------------------------------
    const job_data = this.createJob(flags, command)
    if(!job_data.success)
      return {"job": failure, "job_data": job_data}
    const {job_configuration, job_manager} = job_data.value
    // -- run basic job --------------------------------------------------------
    const job = job_manager.exec(
      job_configuration,
      this.execOptions(parent_id, flags)
    )
    if(this.shouldPrintJobId(job_manager, job, job_configuration.synchronous, flags))
        this.printJobId(job, job_configuration.synchronous)
    return {"job": job, "job_data": job_data}
  }

}
