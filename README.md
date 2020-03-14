cjr
=======

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/gitbucket/gitbucket/blob/master/LICENSE)

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)

cjr is a tool for running jobs in linux containers

# Introduction

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
files: OBJECT
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

1. containerRoot - (STRING) default containerRoot for stacks. This parameter can be overwritten from cli call.
2. rsync - (OBJECT) rsync include and exclude files for upload and download. Upload files are used when job data files are transferred to a volume or remote resource during job creation. Download files are used when job data is copied back from a volume or remote resource back to a host file. The fields for specifying these files are **"upload-exclude-from"**, **"upload-include-from"**, **"download-exclude-from"**, **"download-include-from"**.

Example:
```yaml
files:
  containerRoot: "/"
  rsync:
    upload-exclude-from: "path/to/file"
    upload-include-from: "path/to/file"
    download-exclude-from: "path/to/file"
    download-include-from: "path/to/file"
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
cjr/0.2.0 linux-x64 node-v12.13.1
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
  $ cjr r$

OPTIONS
  -p, --protocol=protocol                      numeric code for rapidly specifying file-upload-mode, stack-upload-mode,
                                               and build-mode

  --async

  --autocopy                                   automatically copy files back to the projec root on exit

  --build-mode=no-rebuild|build|build-nocache  [default: build] specify how to build stack. Options are: no-rebuild,
                                               build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --file-access=volume|bind                    [default: volume] how files are accessed from the container. Options are:
                                               volume and bind.

  --file-upload-mode=cached|uncached           [default: uncached] specifies how project-root is uploaded. "uncached"
                                               uploads to new tmp folder while "cached" syncs to a fixed location

  --label=label                                [default: ] additional labels to append to job

  --message=message                            use this flag to tag a job with a user-supplied message

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --project-root=project-root

  --remote-name=remote-name

  --silent                                     no output is printed

  --stack=stack

  --stack-upload-mode=cached|uncached          [default: uncached] specifies how stack is uploaded. "uncached" uploads
                                               to new tmp folder while "cached" syncs to a fixed file

  --stacks-dir=stacks-dir                      override default stack directory

  --verbose                                    prints output from stack build output and id

  --x11
```

_See code: [src/commands/r$.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/r$.ts)_

## `cjr remote:add REMOTE-NAME`

Add a remote resource.

```
USAGE
  $ cjr remote:add REMOTE-NAME

OPTIONS
  --address=address          (required)
  --copy-key
  --key=key
  --storage-dir=storage-dir  location where job data is stored on remote host.
  --type=cjr                 (required)
  --username=username        (required)
```

_See code: [src/commands/remote/add.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/remote/add.ts)_

## `cjr remote:delete REMOTE-NAME`

Remove a remote resource.

```
USAGE
  $ cjr remote:delete REMOTE-NAME
```

_See code: [src/commands/remote/delete.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/remote/delete.ts)_

## `cjr remote:list`

List all remote resources.

```
USAGE
  $ cjr remote:list

OPTIONS
  --verbose
```

_See code: [src/commands/remote/list.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/remote/list.ts)_

## `cjr remote:set REMOTE-NAME PROP VALUE`

Set a remote resource parameter.

```
USAGE
  $ cjr remote:set REMOTE-NAME PROP VALUE
```

_See code: [src/commands/remote/set.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/remote/set.ts)_

## `cjr remote:ssh [REMOTE-NAME]`

ssh into a remote resource.

```
USAGE
  $ cjr remote:ssh [REMOTE-NAME]

OPTIONS
  -X, --x11
  --explicit
  --remote-name=remote-name
```

_See code: [src/commands/remote/ssh.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/remote/ssh.ts)_

## `cjr rjob:attach [ID]`

Attach back to a running job.

```
USAGE
  $ cjr rjob:attach [ID]

OPTIONS
  --explicit
  --remote-name=remote-name
```

_See code: [src/commands/rjob/attach.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/attach.ts)_

## `cjr rjob:copy [ID]`

Copy job data back into the host directories. Works with both running and completed jobs.

```
USAGE
  $ cjr rjob:copy [ID]

OPTIONS
  --explicit
  --force                         force copy into any directory even if it differs from original project root

  --manual                        opens an interactive bash shell which allows the user can manually copy individual
                                  files

  --mode=update|overwrite|mirror  [default: update] specify copy mode. "update" copies only newer files, "merge" copies
                                  all files, "mirror" copies all files and removes any extranious files

  --project-root=project-root     location for copy operation

  --remote-name=remote-name

  --silent

  --verbose                       shows upload progress
```

_See code: [src/commands/rjob/copy.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/copy.ts)_

## `cjr rjob:delete [ID]`

Delete a job and its associated data (including image). This command works on both running and completed jobs

```
USAGE
  $ cjr rjob:delete [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --delete-files
  --delete-images
  --explicit
  --remoteName=remoteName
  --silent
```

_See code: [src/commands/rjob/delete.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/delete.ts)_

## `cjr rjob:exec ID COMMAND`

Start a shell inside a result. After exiting the changes will be stored as a new result

```
USAGE
  $ cjr rjob:exec ID COMMAND

OPTIONS
  -p, --protocol=protocol                      numeric code for rapidly specifying stack-upload-mode, and build-mode

  --build-mode=no-rebuild|build|build-nocache  [default: build] specify how to build stack. Options are: no-rebuild,
                                               build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                                [default: ] additional labels to append to job

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --project-root=project-root

  --remote-name=remote-name

  --stack=stack

  --stack-upload-mode=cached|uncached          [default: uncached] specifies how stack is uploaded. "uncached" uploads
                                               to new tmp folder while "cached" syncs to a fixed file

  --stacks-dir=stacks-dir                      override default stack directory

  --working-directory=working-directory        [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                               specified directory

  --x11
```

_See code: [src/commands/rjob/exec.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/exec.ts)_

## `cjr rjob:list`

List all running jobs for a stack.

```
USAGE
  $ cjr rjob:list

OPTIONS
  --all
  --explicit
  --hostRoot=hostRoot
  --json
  --remote-name=remote-name
  --verbose
```

_See code: [src/commands/rjob/list.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/list.ts)_

## `cjr rjob:log [ID]`

Print any output generated by a job.

```
USAGE
  $ cjr rjob:log [ID]

OPTIONS
  --explicit
  --lines=lines              [default: 100]
  --remote-name=remote-name
```

_See code: [src/commands/rjob/log.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/log.ts)_

## `cjr rjob:shell [ID]`

Start a shell inside a result. After exiting the changes will be stored as a new result

```
USAGE
  $ cjr rjob:shell [ID]

OPTIONS
  -p, --protocol=protocol                      numeric code for rapidly specifying stack-upload-mode, build-mode

  --build-mode=no-rebuild|build|build-nocache  [default: build] specify how to build stack. Options are: no-rebuild,
                                               build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                                [default: ] additional labels to append to job

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --project-root=project-root

  --remote-name=remote-name

  --stack=stack

  --stack-upload-mode=cached|uncached          [default: uncached] specifies how stack is uploaded. "uncached" uploads
                                               to new tmp folder while "cached" syncs to a fixed file

  --stacks-dir=stacks-dir                      override default stack directory

  --working-directory=working-directory        [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                               specified directory

  --x11
```

_See code: [src/commands/rjob/shell.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/shell.ts)_

## `cjr rjob:state ID`

get the current state of a single job

```
USAGE
  $ cjr rjob:state ID

OPTIONS
  --stack=stack
```

_See code: [src/commands/rjob/state.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/state.ts)_

## `cjr rjob:stop [ID]`

Stop a running job. This command has no effect on completed jobs.

```
USAGE
  $ cjr rjob:stop [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --explicit
  --remote-name=remote-name
  --silent
```

_See code: [src/commands/rjob/stop.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/stop.ts)_

## `cjr shell`

Start an interactive shell for developing in a stack container.

```
USAGE
  $ cjr shell

OPTIONS
  --config-files=config-files            [default: ] additional configuration file to override stack configuration
  --explicit
  --no-autoload                          prevents cli from automatically loading flags using project settings files
  --port=port                            [default: ]
  --project-root=project-root
  --save=save                            saves new image that contains modifications
  --stack=stack
  --stacks-dir=stacks-dir                override default stack directory

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/shell.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/shell.ts)_

## `cjr stack:build [STACK]`

Build the images for any number of stacks.

```
USAGE
  $ cjr stack:build [STACK]

OPTIONS
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --no-cache
  --silent
  --stack=stack
  --stacks-dir=stacks-dir      override default stack directory
```

_See code: [src/commands/stack/build.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/stack/build.ts)_

## `cjr stack:list`

List all stacks present in the stacks path.

```
USAGE
  $ cjr stack:list

OPTIONS
  --stacks-dir=stacks-dir  override default stack directory
```

_See code: [src/commands/stack/list.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/stack/list.ts)_

## `cjr stack:pull URL`

pulls a stack using git directly into the stack folder.

```
USAGE
  $ cjr stack:pull URL

OPTIONS
  --explicit
  --stacks-dir=stacks-dir  override default stack directory
```

_See code: [src/commands/stack/pull.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/stack/pull.ts)_

## `cjr stack:rmi [STACK]`

Delete an image for any number of stacks.

```
USAGE
  $ cjr stack:rmi [STACK]

OPTIONS
  --explicit
  --hostRoot=hostRoot
  --silent
  --stack=stack
  --stacks-dir=stacks-dir  override default stack directory
```

_See code: [src/commands/stack/rmi.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/stack/rmi.ts)_

## `cjr stash`

Save current project state as a result.

```
USAGE
  $ cjr stash

OPTIONS
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --message=message            optional message to describes the job
  --no-autoload                prevents cli from automatically loading flags using project settings files
  --project-root=project-root
  --silent
  --stack=stack
  --stacks-dir=stacks-dir      override default stack directory
```

_See code: [src/commands/stash.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/stash.ts)_
<!-- commandsstop -->
