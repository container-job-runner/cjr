cjr
=======

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/gitbucket/gitbucket/blob/master/LICENSE)

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)

cjr is a tool for running jobs in linux containers


# Introduction

Explain Concept of Project
Explain Concept of Stacks, and default stack folder

Set your stack using  
`export STACK=stack_name`
Set your project root folder with
`export HOSTROOT=absolute_path`
If you are already cd into the directory, then simply type
`export HOSTROOT=$(pwd)`

The most important commands are
1. shell - starts an interactive shell in a container
2. $ command - starts a new job by running command
3. jupyter - manages jupyter server for developing in an environment with jupyter installed

# Stack and Project Config Format for Podman or Docker

The config.yml file in a stack and any overriding configuration files should have the following format.
All fields are options.

```yaml
version: STRING
build:
  dockerfile: STRING
  context: STRING
  args: OBJECT_OF_STRINGS
hostRoot: STRING
stackRoot: STRING
environment: OBJECT_OF_STRINGS  
mounts: ARRAY_OF_OBJECTS
ports: ARRAY_OF_OBJECTS
files: OBJECTS
resources:
  cpus: STRING
  memory: STRING
  memory-swap: STRING
  gpus: STRING
```

### `version`

Configuration file version. Currently only `version: "1"` is supported.

### `build.dockerfile` (optional)

Location of Dockerfile relative to the stack folder. Defaults to:
```yaml
dockerfile: Dockerfile
````

### `build.context` (optional)

Context for build command relative to the stack folder. Defaults to:
```yaml
context: .
````

### `build.args` (optional)

Any arguments use for the build stage. Example:
```yaml
build:
  args:
    ARG1:VALUE1
    ARG2:VALUE2
```

### `hostRoot` (optional)

The default host directory that is mounted to `containerRoot`. It can be absolute or relative to yml file.

### `containerRoot` (optional)

hostRoot will be mapped to containerRoot/basename(hostRoot). Defaults to:
```yaml
containerRoot: /
````

### `environment` (optional)

A list of environment variables that will be passed to container on start. Example:
```yaml
environment:
  ARG1:VALUE1
  ARG2:VALUE2
```

### `mounts` (optional)

There are three type of mounts: binds, volumes, and tempfs.

**Binds**:  The file or directory on the host machine is mounted into a container. Any changes made in the container will be immediately visible on the host. Binds have three properties
1. *type* - must be equal to `bind`
2. *hostPath* - path on host that should be visible to container
3. *containerPath* - path on container where host path will be mounted
4. *consistency* (Optional) - [Mac Only] can be either `consistent` or `delegated` or `cached`
5. *readonly* (Optional) - `true` or `false`

Example
```yaml
mounts:
- type: bind
  hostPath: /home/user/folder
  containerPath: /folder
```

**Volumes**: A storage folder that lies within Docker’s or Podman's own storage directory
1. *type* - must be equal to `volumes`
2. *volumeName* - name of volume
3. *containerPath* - path on container where the volume path will be mounted to
4. *readonly* (Optional) - `true` or `false`

Example
```yaml
mounts:
- type: volume
  volumeName: ExampleVolume
  containerPath: /folder
```

**Tempfs**: A temporary filesystem that resides in the host's memory
1. *type* - must be equal to `tempfs`
2. *containerPath* - path on container where the volume path will be mounted to

Example
```yaml
mounts:
- type: tempfs
  containerPath: /folder
```

### `ports` (optional)

A mapping of ports from host to container. Example:
```yaml
ports:
- hostPort: 8080
  containerPort: 8080
- hostPort: 20
  containerPort: 2020
```
**WARNING**: A stack with open ports does not allow for multiple containers to be run simultaneously.
Therefore, only 1 job can be run at a time, and the shell command cannot be used if a job is running.

### `resources` (optional)
Allows you to limit the resources that each container can use

1. *cpus* - (STRING) max number of CPU cores; can be decimal (e.g. 1.5)
2. *memory* - (STRING) maximum amount of memory; for example `200m` for 200 MB and `4g` for 4 GB.
3. *gpus* - (STRING) set to `all` to access all GPUs from container. See https://docs.docker.com/config/containers/resource_constraints/ for more details
4. *memory-swap* - (STRING) maximum amount of memory including swap. Requires memory to be set.

Example:
```yaml
resources:
  cpus: "1"
  memory: "200m"
  memory-swap: "400m"
  gpus: all
```

### `files` (optional)

1. hostRoot - (STRING) default hostRoot for stack
2. containerRoot - (STRING) default containerRoot for stacks
3. resultPaths - (ARRAY) contains any result folders that should be copied over with result:copy command.

Example:
```yaml
files:
  hostRoot: "/path/"
  containerRoot: "/"
  resultPaths:
  - "results/minor"
  - "result/major"
```


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g cjr
$ cjr COMMAND
running command...
$ cjr (-v|--version|version)
cjr/0.0.0 linux-x64 node-v10.16.3
$ cjr --help [COMMAND]
USAGE
  $ cjr COMMAND
...
```
<!-- usagestop -->

# Commands
<!-- commands -->
* [`cjr $ COMMAND`](#cjr--command)
* [`cjr bundle SAVE_DIR`](#cjr-bundle-save_dir)
* [`cjr config:get [KEY]`](#cjr-configget-key)
* [`cjr config:list`](#cjr-configlist)
* [`cjr config:set [KEY] [VALUE]`](#cjr-configset-key-value)
* [`cjr help [COMMAND]`](#cjr-help-command)
* [`cjr job:attach [ID]`](#cjr-jobattach-id)
* [`cjr job:destroy [ID]`](#cjr-jobdestroy-id)
* [`cjr job:exec ID COMMAND`](#cjr-jobexec-id-command)
* [`cjr job:list`](#cjr-joblist)
* [`cjr job:log [ID]`](#cjr-joblog-id)
* [`cjr job:stop [ID]`](#cjr-jobstop-id)
* [`cjr jupyter:list`](#cjr-jupyterlist)
* [`cjr jupyter:start`](#cjr-jupyterstart)
* [`cjr jupyter:stop`](#cjr-jupyterstop)
* [`cjr result:copy ID`](#cjr-resultcopy-id)
* [`cjr result:delete [ID]`](#cjr-resultdelete-id)
* [`cjr result:list`](#cjr-resultlist)
* [`cjr result:shell [ID]`](#cjr-resultshell-id)
* [`cjr shell`](#cjr-shell)
* [`cjr stack:build`](#cjr-stackbuild)
* [`cjr stack:list`](#cjr-stacklist)
* [`cjr stack:rmi`](#cjr-stackrmi)
* [`cjr stash`](#cjr-stash)

## `cjr $ COMMAND`

Run a shell command as a new job.

```
USAGE
  $ cjr $ COMMAND

OPTIONS
  --async
  --containerRoot=containerRoot
  --explicit
  --hostRoot=hostRoot
  --port=port                    [default: ]
  --silent
  --stack=stack
  --x11
```

_See code: [src/commands/$.ts](https://github.com///blob/v0.0.0/src/commands/$.ts)_

## `cjr bundle SAVE_DIR`

bundle current configuration and files.

```
USAGE
  $ cjr bundle SAVE_DIR

OPTIONS
  --all                include project files in bundle
  --explicit
  --hostRoot=hostRoot
  --stack=stack
  --tar                produces one .tar.gz file (requires zip)
  --zip                produces one .zip file (requires gzip)
```

_See code: [src/commands/bundle.ts](https://github.com///blob/v0.0.0/src/commands/bundle.ts)_

## `cjr config:get [KEY]`

Get a CLI parameter.

```
USAGE
  $ cjr config:get [KEY]
```

_See code: [src/commands/config/get.ts](https://github.com///blob/v0.0.0/src/commands/config/get.ts)_

## `cjr config:list`

List all CLI parameters and data directories.

```
USAGE
  $ cjr config:list
```

_See code: [src/commands/config/list.ts](https://github.com///blob/v0.0.0/src/commands/config/list.ts)_

## `cjr config:set [KEY] [VALUE]`

Set a CLI parameter.

```
USAGE
  $ cjr config:set [KEY] [VALUE]
```

_See code: [src/commands/config/set.ts](https://github.com///blob/v0.0.0/src/commands/config/set.ts)_

## `cjr help [COMMAND]`

display help for cjr

```
USAGE
  $ cjr help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src/commands/help.ts)_

## `cjr job:attach [ID]`

Attach back to the shell that is running a job.

```
USAGE
  $ cjr job:attach [ID]

OPTIONS
  --explicit
  --stack=stack
```

_See code: [src/commands/job/attach.ts](https://github.com///blob/v0.0.0/src/commands/job/attach.ts)_

## `cjr job:destroy [ID]`

Stop a job and destroy the associated result.

```
USAGE
  $ cjr job:destroy [ID]

OPTIONS
  --all
  --explicit
  --stack=stack
```

_See code: [src/commands/job/destroy.ts](https://github.com///blob/v0.0.0/src/commands/job/destroy.ts)_

## `cjr job:exec ID COMMAND`

Execute a command inside the container that is running a job.

```
USAGE
  $ cjr job:exec ID COMMAND

OPTIONS
  --async
  --explicit
  --stack=stack
```

_See code: [src/commands/job/exec.ts](https://github.com///blob/v0.0.0/src/commands/job/exec.ts)_

## `cjr job:list`

List all running jobs for a stack.

```
USAGE
  $ cjr job:list

OPTIONS
  --all
  --explicit
  --hostRoot=hostRoot
  --json
  --stack=stack
```

_See code: [src/commands/job/list.ts](https://github.com///blob/v0.0.0/src/commands/job/list.ts)_

## `cjr job:log [ID]`

Print any output generated by a job.

```
USAGE
  $ cjr job:log [ID]

OPTIONS
  --explicit
  --lines=lines  [default: 100]
  --stack=stack
```

_See code: [src/commands/job/log.ts](https://github.com///blob/v0.0.0/src/commands/job/log.ts)_

## `cjr job:stop [ID]`

Stop a running job and turn it into a result.

```
USAGE
  $ cjr job:stop [ID]

OPTIONS
  --all
  --explicit
  --stack=stack
```

_See code: [src/commands/job/stop.ts](https://github.com///blob/v0.0.0/src/commands/job/stop.ts)_

## `cjr jupyter:list`

List the url of any running jupiter servers for stack.

```
USAGE
  $ cjr jupyter:list

OPTIONS
  --explicit
  --hostRoot=hostRoot
  --stack=stack
```

_See code: [src/commands/jupyter/list.ts](https://github.com///blob/v0.0.0/src/commands/jupyter/list.ts)_

## `cjr jupyter:start`

Start Jupyter server for a stack.

```
USAGE
  $ cjr jupyter:start

OPTIONS
  --containerRoot=containerRoot
  --explicit
  --hostRoot=hostRoot
  --port=port                    [default: 8888]
  --stack=stack
  --sync
```

_See code: [src/commands/jupyter/start.ts](https://github.com///blob/v0.0.0/src/commands/jupyter/start.ts)_

## `cjr jupyter:stop`

Stop the Jupyter server for stack.

```
USAGE
  $ cjr jupyter:stop

OPTIONS
  --explicit
  --hostRoot=hostRoot
  --stack=stack
```

_See code: [src/commands/jupyter/stop.ts](https://github.com///blob/v0.0.0/src/commands/jupyter/stop.ts)_

## `cjr result:copy ID`

Copy job results back into the host directories.

```
USAGE
  $ cjr result:copy ID

OPTIONS
  --all
  --explicit
  --stack=stack
```

_See code: [src/commands/result/copy.ts](https://github.com///blob/v0.0.0/src/commands/result/copy.ts)_

## `cjr result:delete [ID]`

Permanently delete a result and all its associated data.

```
USAGE
  $ cjr result:delete [ID]

OPTIONS
  --all
  --explicit
  --stack=stack
```

_See code: [src/commands/result/delete.ts](https://github.com///blob/v0.0.0/src/commands/result/delete.ts)_

## `cjr result:list`

List all results (i.e. completed jobs) for a stack.

```
USAGE
  $ cjr result:list

OPTIONS
  --all
  --explicit
  --hostRoot=hostRoot
  --json
  --stack=stack
```

_See code: [src/commands/result/list.ts](https://github.com///blob/v0.0.0/src/commands/result/list.ts)_

## `cjr result:shell [ID]`

Start a shell inside a result. After exiting the changes will be stored as a new result

```
USAGE
  $ cjr result:shell [ID]

OPTIONS
  --discard
  --explicit
  --hostRoot=hostRoot
  --stack=stack
```

_See code: [src/commands/result/shell.ts](https://github.com///blob/v0.0.0/src/commands/result/shell.ts)_

## `cjr shell`

Start an interactive shell for developing in a stack container.

```
USAGE
  $ cjr shell

OPTIONS
  --containerRoot=containerRoot
  --explicit
  --hostRoot=hostRoot
  --port=port                    [default: ]
  --save=save                    saves new image that contains modifications
  --stack=stack
  --x11
```

_See code: [src/commands/shell.ts](https://github.com///blob/v0.0.0/src/commands/shell.ts)_

## `cjr stack:build`

Build an image cooresponding to a stack.

```
USAGE
  $ cjr stack:build

OPTIONS
  --explicit
  --hostRoot=hostRoot
  --nocache
  --silent
  --stack=stack
```

_See code: [src/commands/stack/build.ts](https://github.com///blob/v0.0.0/src/commands/stack/build.ts)_

## `cjr stack:list`

List all stacks present in the stacks path.

```
USAGE
  $ cjr stack:list

OPTIONS
  --stacks_path=stacks_path
```

_See code: [src/commands/stack/list.ts](https://github.com///blob/v0.0.0/src/commands/stack/list.ts)_

## `cjr stack:rmi`

Delete an image associated with a stack.

```
USAGE
  $ cjr stack:rmi

OPTIONS
  --explicit
  --hostRoot=hostRoot
  --silent
  --stack=stack
```

_See code: [src/commands/stack/rmi.ts](https://github.com///blob/v0.0.0/src/commands/stack/rmi.ts)_

## `cjr stash`

Save current project state as a result.

```
USAGE
  $ cjr stash

OPTIONS
  --containerRoot=containerRoot
  --explicit
  --hostRoot=hostRoot
  --silent
  --stack=stack
```

_See code: [src/commands/stash.ts](https://github.com///blob/v0.0.0/src/commands/stash.ts)_
<!-- commandsstop -->
