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
* [Usage](#usage)
* [Commands](#commands)
* [Usage](#usage-1)
* [Commands](#commands-1)
* [Usage](#usage-2)
* [Commands](#commands-2)
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
<!-- commands -->
* [`cjr $ COMMAND`](#cjr--command)
* [`cjr bundle SAVE_DIR`](#cjr-bundle-save_dir)
* [`cjr config:get [KEY]`](#cjr-configget-key)
* [`cjr config:list`](#cjr-configlist)
* [`cjr config:set [KEY] [VALUE]`](#cjr-configset-key-value)
* [`cjr help [COMMAND]`](#cjr-help-command)
* [`cjr job:attach [ID]`](#cjr-jobattach-id)
* [`cjr job:copy [ID]`](#cjr-jobcopy-id)
* [`cjr job:delete [ID]`](#cjr-jobdelete-id)
* [`cjr job:exec ID COMMAND`](#cjr-jobexec-id-command)
* [`cjr job:labels [ID]`](#cjr-joblabels-id)
* [`cjr job:list`](#cjr-joblist)
* [`cjr job:log [ID]`](#cjr-joblog-id)
* [`cjr job:shell [ID]`](#cjr-jobshell-id)
* [`cjr job:state ID`](#cjr-jobstate-id)
* [`cjr job:stop [ID]`](#cjr-jobstop-id)
* [`cjr jupyter:list`](#cjr-jupyterlist)
* [`cjr jupyter:start`](#cjr-jupyterstart)
* [`cjr jupyter:stop`](#cjr-jupyterstop)
* [`cjr r$`](#cjr-r$)
* [`cjr remote:add REMOTE-NAME`](#cjr-remoteadd-remote-name)
* [`cjr remote:delete REMOTE-NAME`](#cjr-remotedelete-remote-name)
* [`cjr remote:list`](#cjr-remotelist)
* [`cjr remote:set REMOTE-NAME PROP VALUE`](#cjr-remoteset-remote-name-prop-value)
* [`cjr remote:ssh [REMOTE-NAME]`](#cjr-remotessh-remote-name)
* [`cjr rjob:attach [ID]`](#cjr-rjobattach-id)
* [`cjr rjob:copy [ID]`](#cjr-rjobcopy-id)
* [`cjr rjob:delete [ID]`](#cjr-rjobdelete-id)
* [`cjr rjob:exec ID COMMAND`](#cjr-rjobexec-id-command)
* [`cjr rjob:list`](#cjr-rjoblist)
* [`cjr rjob:log [ID]`](#cjr-rjoblog-id)
* [`cjr rjob:shell [ID]`](#cjr-rjobshell-id)
* [`cjr rjob:state ID`](#cjr-rjobstate-id)
* [`cjr rjob:stop [ID]`](#cjr-rjobstop-id)
* [`cjr shell`](#cjr-shell)
* [`cjr stack:build [STACK]`](#cjr-stackbuild-stack)
* [`cjr stack:list`](#cjr-stacklist)
* [`cjr stack:pull URL`](#cjr-stackpull-url)
* [`cjr stack:rmi [STACK]`](#cjr-stackrmi-stack)
* [`cjr stash`](#cjr-stash)

## `cjr $ COMMAND`

Run a command as a new job.

```
USAGE
  $ cjr $ COMMAND

OPTIONS
  --async
  --autocopy                                   automatically copy files back to the projec root on exit

  --build-mode=no-rebuild|build|build-nocache  [default: build] specify how to build stack. Options are: no-rebuild,
                                               build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --file-access=volume|bind                    [default: volume] how files are accessed from the container. Options are:
                                               volume and bind.

  --keep-record                                prevents container deletion after process exit

  --label=label                                [default: ] additional labels to append to job

  --message=message                            use this flag to tag a job with a user-supplied message

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --project-root=project-root

  --silent                                     no output is printed

  --stack=stack

  --stacks-dir=stacks-dir                      override default stack directory

  --verbose                                    prints output from stack build output and id

  --working-directory=working-directory        [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                               specified directory

  --x11
```

_See code: [src/commands/$.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/$.ts)_

## `cjr bundle SAVE_DIR`

bundle a stack and its project files for sharing.

```
USAGE
  $ cjr bundle SAVE_DIR

OPTIONS
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --include-files              include project files in bundle
  --include-stacks-dir         include all stacks in stacks directory
  --no-autoload                prevents cli from automatically loading flags using project settings files
  --project-root=project-root
  --stack=stack
  --tar                        produces a tar.gz output file (requires zip)
  --verbose
  --zip                        produces a zip output file (requires gzip)
```

_See code: [src/commands/bundle.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/bundle.ts)_

## `cjr config:get [KEY]`

Get a CLI parameter.

```
USAGE
  $ cjr config:get [KEY]
```

_See code: [src/commands/config/get.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/config/get.ts)_

## `cjr config:list`

List all CLI parameters and data directories.

```
USAGE
  $ cjr config:list
```

_See code: [src/commands/config/list.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/config/list.ts)_

## `cjr config:set [KEY] [VALUE]`

Set a CLI parameter.

```
USAGE
  $ cjr config:set [KEY] [VALUE]
```

_See code: [src/commands/config/set.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/config/set.ts)_

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

Attach back to a running job.

```
USAGE
  $ cjr job:attach [ID]

OPTIONS
  --explicit
  --stack=stack
```

_See code: [src/commands/job/attach.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/attach.ts)_

## `cjr job:copy [ID]`

Copy job data back into the host directories. Works with both running and completed jobs.

```
USAGE
  $ cjr job:copy [ID]

OPTIONS
  --copy-path=copy-path           overides job default copy path
  --explicit

  --manual                        opens an interactive bash shell which allows the user can manually copy individual
                                  files

  --mode=update|overwrite|mirror  [default: update] specify copy mode. "update" copies only newer files, "merge" copies
                                  all files, "mirror" copies all files and removes any extranious files

  --stack=stack

  --verbose
```

_See code: [src/commands/job/copy.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/copy.ts)_

## `cjr job:delete [ID]`

Delete a job and its associated data. This command works on both running and completed jobs

```
USAGE
  $ cjr job:delete [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --explicit
  --silent
  --stack=stack
```

_See code: [src/commands/job/delete.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/delete.ts)_

## `cjr job:exec ID COMMAND`

Start an interactive shell to view the files created or modified by a job

```
USAGE
  $ cjr job:exec ID COMMAND

OPTIONS
  --async

  --build-mode=no-rebuild|build|build-nocache  [default: build] specify how to build stack. Options are: no-rebuild,
                                               build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                                [default: ] additional labels to append to job

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --stack=stack

  --stacks-dir=stacks-dir                      override default stack directory

  --working-directory=working-directory        [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                               specified directory

  --x11
```

_See code: [src/commands/job/exec.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/exec.ts)_

## `cjr job:labels [ID]`

Retrieve labels for a job.

```
USAGE
  $ cjr job:labels [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --explicit
  --json
  --label=label
  --stack=stack
```

_See code: [src/commands/job/labels.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/labels.ts)_

## `cjr job:list`

List all running jobs, or all running jobs for a stack.

```
USAGE
  $ cjr job:list

OPTIONS
  --all                if this flag is added then list shows jobs from all stacks, regardless of whether stack flag is
                       set

  --explicit

  --hostRoot=hostRoot

  --json

  --no-autoload        prevents cli from automatically loading flags using project settings files

  --stack=stack

  --verbose
```

_See code: [src/commands/job/list.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/list.ts)_

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

_See code: [src/commands/job/log.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/log.ts)_

## `cjr job:shell [ID]`

Start an interactive shell to view the files created or modified by a job

```
USAGE
  $ cjr job:shell [ID]

OPTIONS
  --build-mode=no-rebuild|build|build-nocache  [default: no-rebuild] specify how to build stack. Options are:
                                               no-rebuild, build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                                [default: ] additional labels to append to job

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --stack=stack

  --stacks-dir=stacks-dir                      override default stack directory

  --working-directory=working-directory        [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                               specified directory

  --x11
```

_See code: [src/commands/job/shell.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/shell.ts)_

## `cjr job:state ID`

get the current state of a single job

```
USAGE
  $ cjr job:state ID

OPTIONS
  --stack=stack
```

_See code: [src/commands/job/state.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/state.ts)_

## `cjr job:stop [ID]`

Stop a running job. This command has no effect on completed jobs.

```
USAGE
  $ cjr job:stop [ID]

OPTIONS
  --all
  --all-completed
  --all-running
  --explicit
  --silent
  --stack=stack
```

_See code: [src/commands/job/stop.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/job/stop.ts)_

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

_See code: [src/commands/jupyter/list.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/jupyter/list.ts)_

## `cjr jupyter:start`

Start Jupyter server for a stack.

```
USAGE
  $ cjr jupyter:start

OPTIONS
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --no-autoload                prevents cli from automatically loading flags using project settings files
  --port=port                  [default: 8888]
  --project-root=project-root
  --stack=stack
  --sync
```

_See code: [src/commands/jupyter/start.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/jupyter/start.ts)_

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

_See code: [src/commands/jupyter/stop.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/jupyter/stop.ts)_

## `cjr r$`

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
