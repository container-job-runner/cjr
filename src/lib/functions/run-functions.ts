import * as fs from 'fs'
import {RunDriver} from '../drivers/abstract/run-driver'
import {PathTools} from '../fileio/path-tools'
import {ValidatedOutput} from '../validated-output'
import {DefaultContainerRoot} from '../constants'
import {buildIfNonExistant} from '../functions/build-functions'


function matchingIds(job_ids: array<string>, stack_path: string, id: string, all:boolean = false)
{
  if(!all && id.length < 1) return new ValidatedOutput(false, [], ["ID string must be at least 1 character long."])
  // find current jobs matching at least part of ID
  const re = new RegExp(`^${id}`)
  const matching_ids = (all) ? job_ids : job_ids.filter(id => re.test(id))
  return (matching_ids.length > 0) ?
    new ValidatedOutput(true, matching_ids) :
    new ValidatedOutput(false, [], ["No Matching Job IDs."])
}

export function matchingJobIds(runner: RunDriver, stack_path: string, id: string, all:boolean = false)
{
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  return matchingIds(runner.jobInfo(image_name).map(x => x.id), stack_path, id, all)
}

export function matchingResultIds(runner: RunDriver, stack_path: string, id: string, all:boolean = false)
{
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  return matchingIds(runner.resultInfo(image_name).map(x => x.id), stack_path, id, all)
}

// determines if job with given name exists
export function jobNametoID(runner: RunDriver, stack_path: string, name: string)
{
  const image_name = (stack_path.length > 0) ? runner.imageName(stack_path) : ""
  const job_info   = runner.jobInfo(image_name)
  const index      = job_info.map(x => x.names).indexOf(name)
  return (index == -1) ? false : job_info[index].id
}

// Get Working for container given CLI Path, hostRoot and Container ROot
export function containerWorkingDir(cli_cwd:string, hroot: string, croot: string)
{
  const hroot_arr = PathTools.split(hroot)
  const rel_path = PathTools.relativePathFromParent(
    hroot_arr,
    PathTools.split(cli_cwd))
  return (rel_path === false) ? false : [croot.replace(/\/$/, "")].concat(hroot_arr.pop(), rel_path).join("/")
}

// Used by dev:ssh and job:start. Calls onSucces with stack configration if stack is build and successuffly loaded
export function IfBuiltAndLoaded(builder: BuildDriver, flags: object, stack_path: string, overloaded_config_paths: array<string>, onSuccess: (configuration: Configuration, containerRoot: string, hostRoot: string) => void)
{
  var result = buildIfNonExistant(builder, stack_path, overloaded_config_paths)
  if(result.success) // -- check that image was built
  {
    result = builder.loadConfiguration(stack_path, overloaded_config_paths)
    if(result.success) // -- check that configuration passed builder requirments
    {
      var configuration = result.data
      var containerRoot = [flags?.containerRoot, configuration.getContainerRoot()]
        .concat(DefaultContainerRoot)
        .reduce((x,y) => x || y)
      var hostRoot = [flags?.hostRoot, configuration.getHostRoot()]
        .concat(false)
        .reduce((x,y) => x || y)
      var output = onSuccess(configuration, containerRoot, hostRoot)
      if(output instanceof ValidatedOutput) result = output
    }
  }
  return result
}
