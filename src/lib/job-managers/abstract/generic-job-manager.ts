import chalk = require('chalk');
import os = require('os')
import { JobManager, JobRunOptions, JobExecOptions, JobCopyOptions, JobDeleteOptions, JobStopOptions, JobStateOptions, JobAttachOptions, JobLogOptions, JobListOptions, JobBuildOptions } from '../abstract/job-manager'
import { JobConfiguration } from '../../config/jobs/job-configuration';
import { ValidatedOutput } from '../../validated-output';
import { firstJob, NewJobInfo, JobInfo, JobState, firstJobId, jobStates, JobInfoFilter } from '../../drivers-containers/abstract/run-driver';
import { label_strings } from '../../constants';
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration';
import { addX11, setRelativeWorkDir, addGenericLabels } from '../../functions/config-functions';

export abstract class GenericJobManager extends JobManager
{
  protected platform = os.platform();
  
  protected ERRORSTRINGS = {
    NO_MATCHING_ID: chalk`{bold No Matching Job ID}`,
    FAILED_START: chalk`{bold Failed to start job}`
  }

  protected STATUSHEADERS = {
    COPY: 'Copy Output',
    BUILD : "Build Output",
    START : "Job Output",
    JOB_ID : "Job Id"
  }

  protected failed_nji:NewJobInfo = {"id": "", "exit-code": 0, "output": ""} // value that will be returned if start or exec fail

  run(job_configuration: JobConfiguration<StackConfiguration<any>>, job_options: JobRunOptions) : ValidatedOutput<NewJobInfo>
  {
    // -- 1. update job properties: apply options --------------------------------
    setRelativeWorkDir(job_configuration, job_options["project-root"] || "", job_options["cwd"])
    addGenericLabels(job_configuration, job_options["project-root"] || "")
    if(job_options.x11)
      addX11(job_configuration, {"platform": this.platform, "shell": this.shell})
    if(job_configuration.stack_configuration.getFlag('cmd-args') == 'join')
        job_configuration.joinCommand()
    // -- 2. start job -----------------------------------------------------------
    this.printStatus({"header": this.STATUSHEADERS.START})
    const job = this.container_drivers.runner.jobStart(
      job_configuration,
      job_configuration.synchronous ? 'inherit' : 'pipe'
    )
    // -- print id ---------------------------------------------------------------
    if(!job.success) job.pushError(this.ERRORSTRINGS.FAILED_START)
    else this.printStatus({header: this.STATUSHEADERS.JOB_ID, message: job.value.id})
    return job
  }

  exec(job_configuration: JobConfiguration<StackConfiguration<any>>, exec_options: JobExecOptions) : ValidatedOutput<NewJobInfo>
  {
    const failed_result = new ValidatedOutput(false, this.failed_nji);

    // -- get parent job information -------------------------------------------
    const job_match = firstJob(
      this.container_drivers.runner.jobInfo({
        "ids": [exec_options["parent-id"]],
        "stack-paths": exec_options["stack-paths"]
      })
    )
    if(!job_match.success)
      return failed_result.absorb(job_match).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
    const parent_job = job_match.value
    
    // -- set up configuration ------------------------------------------------------
    const parent_project_root = parent_job.labels?.[label_strings.job["project-root"]] || ""
    setRelativeWorkDir(job_configuration, parent_project_root, exec_options["cwd"])
    job_configuration.addLabel(label_strings.job["parent-job-id"], parent_job.id)
    job_configuration.addLabel(label_strings.job["type"], "exec")
    job_configuration.addLabel(label_strings.job["command"], job_configuration.command.join(" "))
    job_configuration.remove_on_exit = true
    if(exec_options.x11)
        addX11(job_configuration,  {"platform": this.platform})
    if(job_configuration.stack_configuration.getFlag('cmd-args') == 'join')
        job_configuration.joinCommand()

    const file_config = this.configureExecFileMounts(job_configuration, exec_options, parent_job)
    if(!file_config.success)
      return failed_result.absorb(file_config)
    
    // -- start job -------------------------------------------------------------
    const build_result = this.build(job_configuration.stack_configuration, {"reuse-image": exec_options["reuse-image"]})
    if(!build_result.success)
        return failed_result

    return this.container_drivers.runner.jobStart(job_configuration, job_configuration.synchronous ? 'inherit' : 'pipe')
  }

  protected abstract configureExecFileMounts(job_configuration: JobConfiguration<StackConfiguration<any>>, exec_options: JobExecOptions, parent_job: JobInfo) : ValidatedOutput<undefined>

  copy(options: JobCopyOptions) : ValidatedOutput<undefined>
  {
    this.printStatus({header: this.STATUSHEADERS.COPY})
    const result = new ValidatedOutput(true, undefined);
    // -- get information on all matching jobs -----------------------------------
    var ji_result = this.jobInfo({
      "ids": options['ids'],
      "stack-paths": options["stack-paths"]
    })
    if(!ji_result.success) return result.absorb(ji_result)
    if(ji_result.value.length == 0) return result.pushError(this.ERRORSTRINGS['NO_MATCHING_ID'])
    const job_info_array = ji_result.value

    // // -- copy results from all matching jobs ------------------------------------
    job_info_array.map( (job:JobInfo) => result.absorb(this.copyJob(job, options)))
    return result
  }

  protected abstract copyJob(job:JobInfo, options: JobCopyOptions) : ValidatedOutput<any>

  delete(options: JobDeleteOptions) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    const job_info = this.jobInfo(options)
    if(!job_info.success)
      return new ValidatedOutput(false, undefined)
    if(job_info.value.length == 0 && options?.ids && options.ids.length > 0)
      return new ValidatedOutput(false, undefined).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)

    job_info.value.map( (job: JobInfo) => result.absorb(this.deleteJob(job, options)) )
    return result
  }

  protected deleteJob(job:JobInfo, options: JobDeleteOptions) : ValidatedOutput<any>
  {
    const result = new ValidatedOutput(true, undefined)
    // -- delete job -------------------------------------------------
    const id = job.id;
    const job_delete = this.container_drivers.runner.jobDelete([id])
    result.absorb(job_delete)
    if(this.output_options.verbose && job_delete.success)
        console.log(` deleted job ${id}.`)

    return result
  }

  stop(options: JobStopOptions) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    const job_info = this.jobInfo({ ... options, ... {states: ['running']}})
    if(!job_info.success)
      return new ValidatedOutput(false, undefined)
    if(job_info.value.length == 0 && options?.ids && options.ids.length > 0)
      return new ValidatedOutput(false, undefined).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)

    job_info.value.map( (job: JobInfo) => result.absorb(this.stopJob(job, options)) )
    return result
  }

  protected stopJob(job:JobInfo, options: JobDeleteOptions) : ValidatedOutput<any>
  {
    const result = new ValidatedOutput(true, undefined)
    // -- delete job -------------------------------------------------
    const id = job.id;
    const job_stop = this.container_drivers.runner.jobStop([id])
    result.absorb(job_stop)
    if(this.output_options.verbose && job_stop.success)
        console.log(` stopped job ${id}.`)
        
    return result
  }

  state(options: JobStateOptions) : ValidatedOutput<JobState[]>
  {
    return jobStates(this.jobInfo(options))
  }

  attach(options: JobAttachOptions) : ValidatedOutput<undefined>
  {
    // match with existing container ids
    const result = firstJobId(
      this.jobInfo({
        "ids": [options['id']],
        "stack-paths": options['stack-paths'],
        "states": ["running"]
      }))
    if(result.success) {
      const id  = result.value
      const log = this.container_drivers.runner.jobLog(id, 'all')
      console.log(log.value) // print logs before attach
      return this.container_drivers.runner.jobAttach(id)
    }
    else
      return new ValidatedOutput(false, undefined).pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
  }

  log(options: JobLogOptions) : ValidatedOutput<string>
  {
    // match with existing container ids
    const result = firstJobId(
        this.jobInfo({
            "ids": [options['id']],
            "stack-paths": options['stack-paths']
        })
    )
    if(result.success)
      return this.container_drivers.runner.jobLog(result.value, options["lines"])
    else
      return new ValidatedOutput(false, "").pushError(this.ERRORSTRINGS.NO_MATCHING_ID)
  }

  list(options: JobListOptions) : ValidatedOutput<JobInfo[]>
  {
    return this.jobInfo(options.filter)  
  }

  build(stack_configuration: StackConfiguration<any>, build_options: JobBuildOptions) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    if(build_options["reuse-image"] && this.container_drivers.builder.isBuilt(stack_configuration))
        return result
    else
        return result.absorb(
            this.container_drivers.builder.build(
                stack_configuration, 
                (this.output_options.verbose || build_options?.verbose) ? "inherit" : "pipe", 
                build_options
            )
        )
  }

  protected printStatus(contents: {header: string, message?: string}, line_width:number = 80) 
  {
    if(this.output_options.quiet || !this.output_options.verbose) return
    console.log(chalk`-- {bold ${contents.header}} ${'-'.repeat(Math.max(0,line_width - contents.header.length - 4))}`)
    if(contents?.message) console.log(contents.message)
  }

  protected jobInfo(options?: JobInfoFilter) : ValidatedOutput<JobInfo[]>
  {
    return this.container_drivers.runner.jobInfo(options)
  }

  protected includeExcludeLabelToFlag(label: string) : Array<string>
  {
    return label.split(/[\n\r]+/).filter((s) => !/^\s*$/.test(s));
    // note: for a more compact command we can also use --include={'rule','rule','rule'}:
    // const rules = label?.split(/[\n\r]+/)?.filter((s) => !/^\s*$/.test(s));
    // return {
    //     value: `{${rules.map((r:string) => ShellCommand.bashEscape(r)).join(',')}}`
    //     noescape: true
    // }
  }

}