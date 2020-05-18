import { Dictionary } from './commands/remote-command'

// =============================================================================
// COMPATIBILITY.TS Contains functions and types required by remote component, |
// that have been updated or removed from the current local implementation.    |
// Note: These functions act as a temporary compatibility layer and will be    |
// removed once remote component is rewritten                                  |
//==============================================================================

export type BuildOptions = {
  'never'?: boolean,          // image will never be build
  'reuse-image'?: boolean,     // will not build if image with proper name already exists
  'no-cache'?: boolean,       // if true will build image without cache
  'pull'?:  boolean           // if true will pull all linked images
}

export type port   = {hostPort:number, containerPort: number, address?: string}
export type label  = {key:string, value: string}
export type ports  = Array<port>
export type labels = Array<label>

export type JobOptions = {
    "stack-path": string,                                                       // stack that should be used to run job
    "config-files": Array<string>,                                              // any additional configuration files for stack
    "build-options": BuildOptions,                                              // specifies how to build stack before run
    "command": string,                                                          // command for job
    "entrypoint"?: Array<string>,                                               // optional entrypoint override
    "host-root"?: string,                                                       // project host root
    "file-access": "volume"|"bind",                                             // specifies how project files are accessed by container
    "file-volume-id"?: string,                                                  // if this field is specified, this volume will be mounted at container Root (instead of a new volume being created)
    "synchronous": boolean,                                                     // specifies whether job is run sync or async
    "x11"?: boolean,                                                            // if true binds x11 dirs and passes xauth info to container
    "ports"?: ports,                                                            // specfies ports that should be bound for job
    "environment"?: Dictionary,
    "labels"?: labels,                                                          // specifies labels for job
    "cwd": string                                                               // current directory where user called cli (normally should be process.cwd())
    "remove": boolean,                                                          // if true job should be discarded once it completes
}

// -- options for core function copyJob ----------------------------------------
export type CopyOptions = {
  ids: Array<string>,                                                           // job ids that should be copied
  "stack-paths"?: Array<string>,                                                // only copy jobs that pertain to this stack
  mode:"update"|"overwrite"|"mirror",                                           // specify copy mode (update => rsync --update, overwrite => rsync , mirror => rsync --delete)
  verbose:boolean,                                                              // if true rsync will by run with -v flag
  "host-path"?:string,                                                          // location where files should be copied. if specified this setting overrides job hostDir
  manual?:boolean,                                                              // manually copy - runs terminal instead of rsync command
  force?:boolean                                                                // used by remote for copying into project directories that differ from project directory that was used to start job
}

export type OutputOptions = {
  verbose: boolean,
  explicit: boolean,
  silent: boolean
}

// == Flag Parsing Functions ===================================================

// ---------------------------------------------------------------------------
// PARSEPORTFLAG parses array of strings "port:port" or "port", and returns
// an array of objects with hostPort and containerPort fields. Any malformed
// strings are ignored
// -- Parameters -------------------------------------------------------------
// raw_ports: Array<string> Array of raw label data. Each entry should
// adhere to the format "port:port" or "port" where port is a positive integer
// -- Returns ----------------------------------------------------------------
//  Array<object> Each object has properties "hostPort" and "containerPort"
// ---------------------------------------------------------------------------
export function compat_parseLabelFlag(raw_labels: Array<string>, message: string="")
{
  const labels = []
  raw_labels.map((l:string) => {
    const split_index = l.search('=')
    if(split_index >= 1) labels.push({
      key: l.substring(0, split_index),
      value:l.substring(split_index + 1)
    })
  })
  if(message) labels.push({key: 'message', value: message})
  return labels
}

  // ---------------------------------------------------------------------------
  // PARSEBUILDMODEFLAG parses a string that represents the build mode. string
  // should be of the form:
  //  reuse-image
  //  cached         or     cached, pull
  //  uncached       or     uncached, pull
  // -- Parameters -------------------------------------------------------------
  // build_mode_str: string  - user specified flag value
  // -- Returns ----------------------------------------------------------------
  //  BuildOptions - object that can be used by build-functions
  // ---------------------------------------------------------------------------
 export function compat_parseBuildModeFlag(build_mode_str: string)
  {
    const build_options:BuildOptions = {}
    const options = build_mode_str.split(',').map((s:string) => s.trim())
    if(options?.[0] == 'reuse-image')
      build_options['reuse-image'] = true;
    else if(options?.[0] == 'cached')
      build_options['no-cache'] = false;
    else if(options?.[0] == 'no-cache')
        build_options['no-cache'] = true;

    if(options?.[1] == 'pull')
      build_options['pull'] = true

    return build_options;
  }
