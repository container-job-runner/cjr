cjr
=======

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/gitbucket/gitbucket/blob/master/LICENSE)

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)

cjr is a tool for running jobs in linux containers

<!-- toc -->
* [Introduction](#introduction)
* [YML Configuration Format for Podman and Docker Stacks](#yml-configuration-format-for-podman-and-docker-stacks)
* [YML Configuration Format for Project Directories](#yml-configuration-format-for-project-directories)
* [CLI config settings](#cli-config-settings)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->


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
6. *selinux* (Optional) - `true` or `false`. if true, then :z will be added to mount. If false :z will never be added to mount (even if settings selinux is set to true)

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

# YML Configuration Format for Project Directories

Many cli parameters can be be set using environment variables. For example
`export PROJECTROOT=$(pwd)
export STACK=fedora
export REMOTENAME=resource`
These options can also be specified inside a project-settings.yml file that must be located in a hidden .cjr folder in the project root folder. The command `cjr project:init` can be used to create this file and `cjr project:set`, `cjr project:delete` can be used to modify it. Alternatively the file can be also be created and edited manually. The project-settings.yml file must adhere to the following format. Note that all fields are optional.

```yaml
project-root : "auto",
stack": STRING,
visible-stacks": ARRAY_OF_STRINGS,
config-files": ARRAY_OF_STRINGS,
stacks-dir": STRING,
remote-name": STRING
```

Whenever cjr is called from inside of the project root that contains the .cjr/project-settings file it will automatically set certain flag values. Note that these automatically loaded values can all be overridden by manually specifying the flag during the cli call.

### `project-root` (optional)

If this option is specified then the field must be set to "auto". If the CJR setting *auto-project-root* is set to true using
`cjr config:set auto-project-root true`
then the cjr will automatically pick up the project-root if it is called from anywhere within the project root folder.

### `stack` (optional)

If this option is specified then the cjr will automatically set --stack flag to this value of it is called from within the project root folder.

### `visible-stacks` (optional)

If this option is specified then the cjr:job commands will only show and affect stacks from the visible-stacks array when cjr is called from within the project root folder.

### `config-files` (optional)

Absolute or relative paths to overriding configuration files that should be automatically loaded for any stacks when cjr is called from within the project root folder.

### `stacks-dir` (optional)

If this option is specified then the default stacks directory (i.e. the stacks-dir parameter from `cjr config:ls`) will be overridden whenever cjr is called from within the project root folder.

### `remote-name` (optional)

If this option is specified then cjr will automatically set the --remote-name flag to this this remote resource when called from within the project root folder.

# CLI config settings

We describe the settings that can be viewed and modified using `cjr config:list`, `cjr config:set` and `cjr config:get`  

- **alway-print-job-id**: *boolean* - if true, then cjr $ command will always print the user id even if --async flag is not selected.
- **auto-project-root**: *boolean* - if true, then cjr will automatically traverse up the directory tree looking for .cjr directories where .cjr/project-settings.yml has project-root: "auto". If it finds such a project then it will set the default --project-root flag to this directory.
- **autocopy-sync-job**: *boolean* - if true, then cjr will automatically run job:copy at the end of all synchronous jobs.
- **build_cmd**: *"podman"|"docker"* - container environment used to build images.
- **container_default_shell**: *string* default shell that should be started for job:shell commands (e.g. sh, bash, zsh).
- **image_tag**: *string* tag that cli uses when building all its images.
- **interactive**: *boolean* - if true then certain cli commands will prompt the user with interactive menus.
- **job-default-run-mode**: *"async"|"sync"*  determines if new jobs run sync or async by default.
- **job_list_fields**: *string* specifies which fields appear when running job:list. The string must be a comma separated list that contains any subset of the fields "id", "stack", "stackName", "statusString", "command", "message". For example:
`cjr config:set job_list_fields 'id, stackName, command, statusString'`
- **jupyter_app**: *string* - absolute path to optional cjr electron jupyter app. leave blank to disable.
- **jupyter_command**: *string* - command that should be run to start Jupyter. This allows you to choose between Jupyter lab or Jupyter notebook.
- **run_cmd**: *"podman"|"docker"* - container environment used to run images.
- **run_shortcuts_file**: *string* - location of a yml file that can be used to specify run shortcuts for `cjr $` command. See file format description below.
- **selinux**: *boolean* - if true then the :Z option will be applied to all bind mounts.
- **stacks-dir**: *string* - the default path to a folder that contains cjr stacks.

The run_shortcuts_file option allows you to define custom shortcuts for the `cjr $` command when called it's called with a single argument. For example you can map `cjr $ script.sh` to `cjr $ bash script.sh`. The yml file must correspond to an object with string keys and values. For example
```yaml
  KEY1: VALUE1
  KEY2: VALUE2
  KEY3: VALUE3
```
The key will corresponds to a regular expression, and the value should contain the letters $ARG. If the regular expression matches the user argument, then the $ARG will be replaced with the user arg. An example file could be
```yaml
"\\.sh$": bash $ARG
"\\.m$": matlab -nosplash -nodisplay -nojvm -nodesktop $ARG
"\\.py$": python $ARG
```
This would map

  `cjr $ script.sh -> cjr $ bash script.sh
  cjr $ script.m  -> cjr $ matlab -nosplash -nodisplay -nojvm -nodesktop script.m
  cjr $ script.py -> cjr $ python script.py`

# Usage
<!-- usage -->
```sh-session
$ npm install -g cjr
$ cjr COMMAND
running command...
$ cjr (-v|--version|version)
cjr/0.2.0 linux-x64 node-v12.16.1
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

## `cjr remote:set REMOTE-NAME`

Set a remote resource parameter.

```
USAGE
  $ cjr remote:set REMOTE-NAME

OPTIONS
  --address=address
  --enabled=enabled
  --storage-dir=storage-dir  location where job data is stored on remote host.
  --type=type
  --username=username
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

## `cjr remote:stack:rsync [REMOTE-NAME]`

rsyncs local stack_dir with remote resource or vice-versa.

```
USAGE
  $ cjr remote:stack:rsync [REMOTE-NAME]

OPTIONS
  --direction=push|pull      (required) push syncs local stacks to remote, pull sync remote stacks to local
  --explicit
  --mirror                   if selected all files on destination that are not also on the source will be deleted
  --no-autoload              prevents cli from automatically loading flags using project settings files
  --remote-name=remote-name
  --stacks-dir=stacks-dir    override default stack directory
  --verbose
```

_See code: [src/commands/remote/stack/rsync.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/remote/stack/rsync.ts)_

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
  --remote-name=remote-name
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
  --async

  --build-mode=no-rebuild|build|build-nocache  [default: build] specify how to build stack. Options are: no-rebuild,
                                               build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                                [default: ] additional labels to append to job

  --message=message                            use this flag to tag a job with a user-supplied message

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: ]

  --project-root=project-root

  --remote-name=remote-name

  --stack=stack

  --stack-upload-mode=cached|uncached          [default: uncached] specifies how stack is uploaded. "uncached" uploads
                                               to new tmp folder while "cached" syncs to a fixed file

  --stacks-dir=stacks-dir                      override default stack directory

  --sync

  --verbose                                    prints output from stack build output and id

  --working-directory=working-directory        [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                               specified directory

  --x11
```

_See code: [src/commands/rjob/exec.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/exec.ts)_

## `cjr rjob:jupyter ID [COMMAND]`

Start a shell inside a result. After exiting the changes will be stored as a new result

```
USAGE
  $ cjr rjob:jupyter ID [COMMAND]

OPTIONS
  -p, --protocol=protocol                      numeric code for rapidly specifying stack-upload-mode, and build-mode

  --build-mode=no-rebuild|build|build-nocache  [default: no-rebuild] specify how to build stack. Options are:
                                               no-rebuild, build, and build-nocache.

  --config-files=config-files                  [default: ] additional configuration file to override stack configuration

  --explicit

  --no-autoload                                prevents cli from automatically loading flags using project settings
                                               files

  --port=port                                  [default: 8888]

  --project-root=project-root

  --remote-name=remote-name

  --stack=stack

  --stack-upload-mode=cached|uncached          [default: uncached] specifies how stack is uploaded. "uncached" uploads
                                               to new tmp folder while "cached" syncs to a fixed file

  --stacks-dir=stacks-dir                      override default stack directory

  --verbose                                    prints output from stack build output and id

  --x11
```

_See code: [src/commands/rjob/jupyter.ts](https://github.com/buvoli/cjr/blob/v0.2.0/src/commands/rjob/jupyter.ts)_

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
  --all-configurations
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --silent
  --stack=stack
  --stacks-dir=stacks-dir      override default stack directory
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
