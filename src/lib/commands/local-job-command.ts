import chalk = require('chalk')
import path = require('path')
import constants = require('../constants')
import fs = require('fs')
import { BasicCommand, ContainerSDK } from './basic-command'
import { updateStackConfig, updateJobConfig } from '../functions/config-functions'
import { ValidatedOutput } from '../validated-output'
import { JobRunOptions,  ContainerDrivers, JobExecOptions } from '../job-managers/abstract/job-manager'
import { JobConfiguration } from '../config/jobs/job-configuration'
import { StackConfiguration } from '../config/stacks/abstract/stack-configuration'
import { NewJobInfo, firstJob } from '../drivers-containers/abstract/run-driver'
import { printValidatedOutput } from '../functions/misc-functions'
import { JSTools } from '../js-tools'
import { Dictionary } from '../remote/commands/remote-command'

// ===========================================================================
// NewJobCommand: An abstract Class for cli commands that start new jobs.
// Contains functions for converting cli flags into SDK Configurations
// ===========================================================================

type CLIJobFlags = {
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
    "autocopy"?:boolean
    "visible-stacks"?: Array<string>
}

type StackData = ContainerSDK & {
  "stack_configuration": StackConfiguration<any>
}

type JobData = StackData & {
  "job_configuration": JobConfiguration<StackConfiguration<any>>,
}

export abstract class LocalJobCommand extends BasicCommand
{

  // alters flags based on --here and local project settings
  augmentFlagsForJob(flags: CLIJobFlags)
  {
    this.augmentFlagsWithHere(flags)
    this.augmentFlagsWithProjectSettings(flags, {
      "stack": true,
      "profile": false,
      "config-files": false,
      "project-root":false,
      "stacks-dir": false
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

  // generates stack based on cli flags
  createStack(flags: CLIJobFlags) : ValidatedOutput<StackData>
  {
    // -- init Container SDK components ----------------------------------------
    const {configurations, container_drivers, job_manager, output_options} = this.initContainerSDK(
      flags["verbose"] || false,
      flags["quiet"] || false,
      flags["explicit"] || false
    )
    // -- load run-shortcuts ---------------------------------------------------
    const run_shortcuts = this.newRunShortcuts()
    // -- init stack configuration ---------------------------------------------
    const load = this.initStackConfiguration(flags, configurations)
    const stack_configuration = load.value
    // -- set stack options ----------------------------------------------------
    updateStackConfig(stack_configuration, {
      "ports": this.parsePortFlag(flags?.port || []),
      "build-flags": this.extractBuildFlags(flags)
    });

    return new ValidatedOutput(true, {
      "stack_configuration": stack_configuration,
      "configurations": configurations,
      "container_drivers": container_drivers,
      "job_manager": job_manager,
      "output_options": output_options
    }).absorb(load)
  }

  // generates jobConfiguration based on cli flags
  createJob(flags: CLIJobFlags, command: Array<string>) : ValidatedOutput<JobData>
  {
    // -- init Container SDK components ----------------------------------------
    const load = this.createStack(flags)
    const {stack_configuration, configurations, container_drivers, job_manager, output_options} = load.value
    // -- load run-shortcuts ---------------------------------------------------
    const run_shortcuts = this.newRunShortcuts()
    // -- set job options ------------------------------------------------------
    const job_configuration = configurations.job(stack_configuration)
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
      "configurations": configurations,
      "container_drivers": container_drivers,
      "job_manager": job_manager,
      "output_options": output_options
    }).absorb(load)
  }

  // generates JobRunOptions based on cli flags
  runOptions(flags: CLIJobFlags): JobRunOptions
  {
    return {
        "reuse-image": this.extractReuseImage(flags),
        "project-root-file-access":  (flags['file-access'] as "volume"|"bind"),
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
    this.printJobId(job, flags)
    return {"job": job, "job_data": job_data}
  }

  runSimpleJobAndCopy(flags: CLIJobFlags, command: Array<string>) : {job: ValidatedOutput<NewJobInfo>, job_data: ValidatedOutput<JobData>}
  {
    const {job, job_data} = this.runSimpleJob(flags, command)
    const result = {"job": job, "job_data": job_data}

    if(!job.success || !job_data.success) return {"job": job, "job_data": job_data}
    // -- copy back results ----------------------------------------------------
    const {job_manager, configurations, container_drivers, output_options} = job_data.value
    const job_id = job.value.id
    if(this.shouldAutocopy(flags, container_drivers, job_id))
      printValidatedOutput(
        job_manager.copy({
          "ids": [job_id],
          "mode": "update"
        })
      )
    return result

  }

  shouldAutocopy(flags: CLIJobFlags, drivers: ContainerDrivers, job_id: string)
  {
    // -- check flag status ----------------------------------------------------
    if(!flags["project-root"]) return false
    if(flags["file-access"] === 'bind') return false
    // -- check that job has stopped -------------------------------------------
    const result = firstJob(drivers.runner.jobInfo({"ids": [job_id], "states": ['exited']}))
    if(!result.success) return false
    if(flags["autocopy"]) return true
    const synchronous = flags['sync'] || (!flags['async'] && (this.settings.get('job-default-run-mode') == 'sync'))
    if(synchronous && this.settings.get('autocopy-sync-job')) return true
    return false
  }

  private printJobId(job: ValidatedOutput<NewJobInfo>, flags: CLIJobFlags)
  {
    const skip_print = !job.success || flags.quiet || flags.verbose
    if(skip_print) return
    else if (flags.async)
      console.log(job.value.id)
    else if(!flags.async && this.settings.get('alway-print-job-id'))
      console.log(chalk`-- {bold Job Id }${'-'.repeat(54)}\n${job.value.id}`)
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
    this.printJobId(job, flags)
    return {"job": job, "job_data": job_data}
  }

}
