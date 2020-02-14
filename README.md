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

# YML Configuration Format for Podman and Docker Stacks

Every Docker and Podman stack may contain an optional configuration file named config.yml. Overriding configuration files can also be referenced from the .cjr/settings.yml file located in a project's root folder. The config.yml file and any overriding configuration files must adhere to the following format. Note that all fields are options.

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

Context for the build command. Path is relative to the stack folder. Defaults to:
```yaml
context: .
````

### `build.args` (optional)

Any arguments used during image build. Example:
```yaml
build:
  args:
    ARG1:VALUE1
    ARG2:VALUE2
```

### `hostRoot` (optional)

The default host directory that is mounted to `containerRoot`. It can be either an absolute path or a path that is relative to the configuration file.

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

There are three type of supported mounts: binds, volumes, and tempfs.

**Binds**:  The file or directory on the host machine is mounted into a container. Any changes made in the container will be immediately visible on the host. Binds have three required properties and two optional properties:
1. *type* - must be equal to `bind`
2. *hostPath* - path on host that should be mounted inside container
3. *containerPath* - path on container where host path will be mounted to
4. *readonly* (Optional) - `true` or `false`
5. *consistency* [Mac Only] (Optional) - can be either `consistent` or `delegated` or `cached`

Example
```yaml
mounts:
- type: bind
  hostPath: /home/user/folder
  containerPath: /folder
```

**Volumes**: Equivalent to a bind, except it utilized a storage folder that is managed by Docker or Podman. Volumes have three required properties and one optional properties:
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

**Tempfs**: A temporary filesystem that resides in the host's memory. Tempfs mounts have two required properties:
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
**WARNING**: Due to port collisions, it is not possible to run multiple containers for a stack with open ports. If you configure ports then only only 1 job can be run at a time, and the shell and $ commands cannot be used simultaneously.

### `resources` (optional)
Allows you to limit the resources that each container can use

1. *cpus* - (STRING) max number of CPU cores; can be decimal (e.g. 1.5)
2. *memory* - (STRING) maximum amount of memory; for example `200m` for 200 MB and `4g` for 4 GB.
3. *gpus* - (STRING) set to `all` to access all GPUs from container. See https://docs.docker.com/config/containers/resource_constraints/ for more details
4. *memory-swap* - (STRING) maximum amount of memory including swap. Requires memory to be set.

**WARNING**: Enabling resource management requires root privileges in Podman.

Example:
```yaml
resources:
  cpus: "1"
  memory: "200m"
  memory-swap: "400m"
  gpus: all
```

### `files` (optional)

1. hostRoot - (STRING) default hostRoot for stack. This parameter can be overwritten from cli call.
2. containerRoot - (STRING) default containerRoot for stacks. This parameter can be overwritten from cli call.
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
* [Introduction](#introduction)
* [YML Configuration Format for Podman and Docker Stacks](#yml-configuration-format-for-podman-and-docker-stacks)
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
cjr/0.1.3 linux-x64 node-v12.13.1
$ cjr --help [COMMAND]
USAGE
  $ cjr COMMAND
...
```
<!-- usagestop -->

# Commands


Run a command as a new job on a remote resource.

```
USAGE
  $ cjr remote:$

OPTIONS
  --async
  --autocopy                 automatically copy files back to hostRoot on exit
  --autocopy-all             automatically copy all files results back to hostRoot on exit
  --configFiles=configFiles  [default: ] additional configuration file to override stack configuration
  --explicit
  --hostRoot=hostRoot
  --no-autoload              prevents cli from automatically loading flags using project settings files
  --port=port                [default: ]
  --remoteName=remoteName
  --silent
  --stack=stack
  --verbose                  shows upload progress
  --x11
```

_See code: [src/commands/remote/$.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/$.ts)_

## `cjr remote:add`

Add a remote resource.

```
USAGE
  $ cjr remote:add

OPTIONS
  --address=address          (required)
  --copy-key
  --key=key
  --name=name                (required)
  --storage-dir=storage-dir  location where job data is stored on remote host.
  --type=type                (required)
  --username=username        (required)
```

_See code: [src/commands/remote/add.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/add.ts)_

## `cjr remote:delete REMOTE-NAME`

Remove a remote resource.

```
USAGE
  $ cjr remote:delete REMOTE-NAME
```

_See code: [src/commands/remote/delete.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/delete.ts)_

## `cjr remote:job:attach [ID]`

Attach back to a running job.

```
USAGE
  $ cjr remote:job:attach [ID]

OPTIONS
  --explicit
  --remoteName=remoteName
```

_See code: [src/commands/remote/job/attach.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/attach.ts)_

## `cjr remote:job:copy [ID]`

Copy job data back into the host directories. Works with both running and completed jobs.

```
USAGE
  $ cjr remote:job:copy [ID]

OPTIONS
  --all
  --explicit
  --force                  force copy into any directory
  --hostRoot=hostRoot
  --remoteName=remoteName
  --silent
  --verbose                shows upload progress
```

_See code: [src/commands/remote/job/copy.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/copy.ts)_

## `cjr remote:job:delete [ID]`

Delete a job and its associated data. This command works on both running and completed jobs

```
USAGE
  $ cjr remote:job:delete [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --explicit
  --remoteName=remoteName
  --silent
```

_See code: [src/commands/remote/job/delete.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/delete.ts)_

## `cjr remote:job:list`

List all running jobs for a stack.

```
USAGE
  $ cjr remote:job:list

OPTIONS
  --all
  --explicit
  --hostRoot=hostRoot
  --json
  --remoteName=remoteName
  --verbose
```

_See code: [src/commands/remote/job/list.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/list.ts)_

## `cjr remote:job:log [ID]`

Print any output generated by a job.

```
USAGE
  $ cjr remote:job:log [ID]

OPTIONS
  --explicit
  --lines=lines            [default: 100]
  --remoteName=remoteName
```

_See code: [src/commands/remote/job/log.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/log.ts)_

## `cjr remote:job:shell [ID]`

Start a shell inside a result. After exiting the changes will be stored as a new result

```
USAGE
  $ cjr remote:job:shell [ID]

OPTIONS
  --configFiles=configFiles  [default: ] additional configuration file to override stack configuration
  --discard
  --explicit
  --hostRoot=hostRoot
  --no-autoload              prevents cli from automatically loading flags using project settings files
  --remoteName=remoteName
  --stack=stack
```

_See code: [src/commands/remote/job/shell.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/shell.ts)_

## `cjr remote:job:stop [ID]`

Stop a running job. This command has no effect on completed jobs.

```
USAGE
  $ cjr remote:job:stop [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --explicit
  --remoteName=remoteName
  --silent
```

_See code: [src/commands/remote/job/stop.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/job/stop.ts)_

## `cjr remote:list`

List all remote resources.

```
USAGE
  $ cjr remote:list

OPTIONS
  --verbose
```

_See code: [src/commands/remote/list.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/list.ts)_

## `cjr remote:set REMOTE-NAME PROP VALUE`

Set a remote resource parameter.

```
USAGE
  $ cjr remote:set REMOTE-NAME PROP VALUE
```

_See code: [src/commands/remote/set.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/set.ts)_

## `cjr remote:ssh [REMOTE-NAME]`

ssh into a remote resource.

```
USAGE
  $ cjr remote:ssh [REMOTE-NAME]

OPTIONS
  --explicit
  --remoteName=remoteName
```

_See code: [src/commands/remote/ssh.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/remote/ssh.ts)_

## `cjr shell`

Start an interactive shell for developing in a stack container.

```
USAGE
  $ cjr shell

OPTIONS
  --configFiles=configFiles  [default: ] additional configuration file to override stack configuration
  --explicit
  --hostRoot=hostRoot
  --no-autoload              prevents cli from automatically loading flags using project settings files
  --port=port                [default: ]
  --save=save                saves new image that contains modifications
  --stack=stack
  --x11
```

_See code: [src/commands/shell.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/shell.ts)_

## `cjr stack:build`

Build an image cooresponding to a stack.

```
USAGE
  $ cjr stack:build

OPTIONS
  --configFiles=configFiles  [default: ] additional configuration file to override stack configuration
  --explicit
  --hostRoot=hostRoot
  --nocache
  --silent
  --stack=stack
```

_See code: [src/commands/stack/build.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/stack/build.ts)_

## `cjr stack:clone URL`

pulls a stack using git directly into the stack folder.

```
USAGE
  $ cjr stack:clone URL

OPTIONS
  --explicit
  --stacks_path=stacks_path
```

_See code: [src/commands/stack/clone.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/stack/clone.ts)_

## `cjr stack:list`

List all stacks present in the stacks path.

```
USAGE
  $ cjr stack:list

OPTIONS
  --stacks_path=stacks_path
```

_See code: [src/commands/stack/list.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/stack/list.ts)_

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

_See code: [src/commands/stack/rmi.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/stack/rmi.ts)_

## `cjr stash`

Save current project state as a result.

```
USAGE
  $ cjr stash

OPTIONS
  --configFiles=configFiles  [default: ] additional configuration file to override stack configuration
  --explicit
  --hostRoot=hostRoot
  --message=message          optional message to describes the job
  --no-autoload              prevents cli from automatically loading flags using project settings files
  --silent
  --stack=stack
```

_See code: [src/commands/stash.ts](https://github.com/buvoli/cjr/blob/v0.1.2/src/commands/stash.ts)_
<!-- commandsstop -->
