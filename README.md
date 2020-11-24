cjr
=======

cjr is a tool for running jobs in linux containers

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/gitbucket/gitbucket/blob/master/LICENSE)

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
cjr/0.4.2 linux-x64 node-v12.16.1
$ cjr --help [COMMAND]
USAGE
  $ cjr COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`cjr $ COMMAND`](#cjr--command)
* [`cjr bundle BUNDLE-PATH`](#cjr-bundle-bundle-path)
* [`cjr config:ls`](#cjr-configls)
* [`cjr config:set`](#cjr-configset)
* [`cjr help [COMMAND]`](#cjr-help-command)
* [`cjr init`](#cjr-init)
* [`cjr job:attach [ID]`](#cjr-jobattach-id)
* [`cjr job:cp [ID]`](#cjr-jobcp-id)
* [`cjr job:exec ID COMMAND`](#cjr-jobexec-id-command)
* [`cjr job:info [ID]`](#cjr-jobinfo-id)
* [`cjr job:jupyter:ls`](#cjr-jobjupyterls)
* [`cjr job:jupyter:start [ID]`](#cjr-jobjupyterstart-id)
* [`cjr job:jupyter:stop [ID]`](#cjr-jobjupyterstop-id)
* [`cjr job:log [ID]`](#cjr-joblog-id)
* [`cjr job:ls`](#cjr-jobls)
* [`cjr job:rm [ID]`](#cjr-jobrm-id)
* [`cjr job:shell [ID]`](#cjr-jobshell-id)
* [`cjr job:start COMMAND`](#cjr-jobstart-command)
* [`cjr job:state ID`](#cjr-jobstate-id)
* [`cjr job:stop [ID]`](#cjr-jobstop-id)
* [`cjr jupyter:ls`](#cjr-jupyterls)
* [`cjr jupyter:start [PROJECT-ROOT]`](#cjr-jupyterstart-project-root)
* [`cjr jupyter:stop [PROJECT-ROOT]`](#cjr-jupyterstop-project-root)
* [`cjr pconfig:item-append`](#cjr-pconfigitem-append)
* [`cjr pconfig:item-remove`](#cjr-pconfigitem-remove)
* [`cjr pconfig:ls`](#cjr-pconfigls)
* [`cjr pconfig:profile:add [PATH]`](#cjr-pconfigprofileadd-path)
* [`cjr pconfig:rm`](#cjr-pconfigrm)
* [`cjr pconfig:set`](#cjr-pconfigset)
* [`cjr resource:add RESOURCE`](#cjr-resourceadd-resource)
* [`cjr resource:ls`](#cjr-resourcels)
* [`cjr resource:rm RESOURCE`](#cjr-resourcerm-resource)
* [`cjr resource:set RESOURCE`](#cjr-resourceset-resource)
* [`cjr resource:ssh [RESOURCE]`](#cjr-resourcessh-resource)
* [`cjr shell`](#cjr-shell)
* [`cjr stack:build [STACK]`](#cjr-stackbuild-stack)
* [`cjr stack:create NAME`](#cjr-stackcreate-name)
* [`cjr stack:ls`](#cjr-stackls)
* [`cjr stack:pull URL`](#cjr-stackpull-url)
* [`cjr stack:rmi [STACK]`](#cjr-stackrmi-stack)
* [`cjr stack:snapshot [STACK]`](#cjr-stacksnapshot-stack)
* [`cjr theia:ls`](#cjr-theials)
* [`cjr theia:start [PROJECT-ROOT]`](#cjr-theiastart-project-root)
* [`cjr theia:stop [PROJECT-ROOT]`](#cjr-theiastop-project-root)

## `cjr $ COMMAND`

Start a job that runs a shell command.

```
USAGE
  $ cjr $ COMMAND

OPTIONS
  -q, --quiet
  -v, --verbose                          shows output for each stage of the job.
  --async
  --autocopy                             automatically copy files back to the project root on exit

  --build-mode=build-mode                [default: cached] specify how to build stack. Options include "reuse-image",
                                         "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --file-access=volume|shared            [default: volume] how files are accessed from the container.

  --here                                 sets project-root to current working directory

  --label=label                          [default: ] additional labels to append to job

  --message=message                      use this flag to tag a job with a user-supplied message

  --no-autocopy                          do not copy files back to the project root on exit

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --resource=resource

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --sync

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/$.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/$.ts)_

## `cjr bundle BUNDLE-PATH`

Bundle a stack or project into a zip or tar for sharing.

```
USAGE
  $ cjr bundle BUNDLE-PATH

OPTIONS
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --config-only                only bundle project configuration
  --explicit
  --no-autoload                prevents cli from automatically loading flags using project settings files
  --project-root=project-root
  --stack=stack
  --stacks-dir=stacks-dir      override default stack directory
  --tar                        produces a tar.gz output file (requires tar)
  --verbose
  --zip                        produces a zip output file (requires zip)
```

_See code: [src/commands/bundle.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/bundle.ts)_

## `cjr config:ls`

List all cli parameters and data directories.

```
USAGE
  $ cjr config:ls

OPTIONS
  --json
```

_See code: [src/commands/config/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/config/ls.ts)_

## `cjr config:set`

Set one or multiple cli parameters.

```
USAGE
  $ cjr config:set

OPTIONS
  -q, --quiet

  --always-print-job-id=true|false                            if true, then cjr job:start command will always print the
                                                              user id even if --async flag is not selected.

  --auto-project-root=true|false                              if true, then cjr will automatically traverse up the
                                                              directory tree looking for .cjr directories where
                                                              .cjr/project-settings.yml has project-root: "auto". If it
                                                              finds such a project then it will set the default
                                                              --project-root flag to this directory.

  --autocopy-sync-job=true|false                              if true, then cjr will automatically run job:copy at the
                                                              end of all synchronous jobs.

  --container-registry=container-registry                     url of default container registry for pushing snapshots.

  --container-registry-user=container-registry-user           container registry username for pushing snapshots.

  --default-container-shell=default-container-shell           default shell that should be started for shell and
                                                              job:shell commands (e.g. sh, bash, zsh).

  --driver=podman-cli|docker-cli|docker-socket|podman-socket  container engine used to build and run images.

  --image-tag=image-tag                                       tag that cli uses when building all its images.

  --interactive=true|false                                    if true, then certain cli commands will prompt the user
                                                              with interactive menus.

  --job-default-run-mode=sync|async                           determines if new jobs run sync or async by default.

  --job-ls-fields=job-ls-fields                               specifies which fields appear when running job:list. The
                                                              string must be a comma separated list that contains any
                                                              subset of the fields "id", "stack", "stackName", "status",
                                                              "command", "message".

  --jupyter-command=jupyter lab|jupyter notebook              command that should be run to start Jupyter (e.g. "jupyter
                                                              lab" or "jupyter notebook").

  --on-server-start=on-server-start                           command that should be run after a Jupyter or Theia server
                                                              starts.

  --run-shortcuts-file=run-shortcuts-file                     location of a yml file that can be used to specify run
                                                              shortcuts for the cjr job:start command; To disable set
                                                              value to ''.

  --selinux=true|false                                        if true, then the :Z option will be applied to all bind
                                                              mounts.

  --socket-path=socket-path                                   location of container runtime socket.

  --stacks-dir=stacks-dir                                     the default path to a folder that contains cjr stacks.

  --timeout-jupyter=timeout-jupyter                           maximum number of seconds that cjr should wait for jupyter
                                                              server to start.

  --timeout-theia=timeout-theia                               number of seconds that cjr should wait for theia server to
                                                              start.

  --xquartz-autostart=true|false                              only affects mac. if true, then cjr will try to start
                                                              xquartz automatically when --x11 flag is selected.
```

_See code: [src/commands/config/set.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/config/set.ts)_

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

## `cjr init`

Initialize a project in the current directory.

```
USAGE
  $ cjr init

OPTIONS
  --project-root-auto
  --resource=resource                      default resource for project
  --stack=stack                            default stack for project
  --stacks-dir=stacks-dir                  override default stack directory for project
  --template=empty|default|project-stacks  [default: default]

  --visible-stacks=visible-stacks          if specified, only these stacks will be visible when running cjr from within
                                           this project directory.
```

_See code: [src/commands/init.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/init.ts)_

## `cjr job:attach [ID]`

Attach to a running job.

```
USAGE
  $ cjr job:attach [ID]

OPTIONS
  --explicit
  --no-autoload                    prevents cli from automatically loading flags using project settings files
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/attach.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/attach.ts)_

## `cjr job:cp [ID]`

Copy job files back into the host directories; works on both running and completed jobs.

```
USAGE
  $ cjr job:cp [ID]

OPTIONS
  -q, --quiet
  -v, --verbose                          Shows output from rsync.

  --all-files                            If selected, any include or exclude file will be ignored and all project files
                                         will be copied

  --copy-path=copy-path                  Overides job default copy path.

  --explicit

  --mode=update|overwrite|mirror|manual  [default: update] Specify copy mode: "update" copies only newer files, "merge"
                                         copies all files, "mirror" copies all files and removes any extranious files,
                                         "manual" opens an interactive sessions that allows a user to manually copy
                                         files.

  --no-autoload                          Prevents cli from automatically loading flags using project settings files.

  --resource=resource

  --stacks-dir=stacks-dir                Override default stack directory.

  --visible-stacks=visible-stacks        If specified only these stacks will be affected by this command.
```

_See code: [src/commands/job/cp.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/cp.ts)_

## `cjr job:exec ID COMMAND`

Start a new job using files from a completed or currently running job.

```
USAGE
  $ cjr job:exec ID COMMAND

OPTIONS
  -q, --quiet
  -v, --verbose                          shows output for each stage of the job.
  --async

  --build-mode=build-mode                [default: cached] specify how to build stack. Options include "reuse-image",
                                         "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                          [default: ] additional labels to append to job

  --message=message                      use this flag to tag a job with a user-supplied message

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --resource=resource

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --sync

  --visible-stacks=visible-stacks        if specified only these stacks will be affected by this command

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/job/exec.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/exec.ts)_

## `cjr job:info [ID]`

Get detailed information on the hidden properties of a job.

```
USAGE
  $ cjr job:info [ID]

OPTIONS
  --explicit
  --json
  --no-autoload                    prevents cli from automatically loading flags using project settings files
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/info.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/info.ts)_

## `cjr job:jupyter:ls`

List running jupiter servers.

```
USAGE
  $ cjr job:jupyter:ls

OPTIONS
  --explicit
  --json
  --resource=resource
```

_See code: [src/commands/job/jupyter/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/jupyter/ls.ts)_

## `cjr job:jupyter:start [ID]`

Start a Jupyter server inside a job.

```
USAGE
  $ cjr job:jupyter:start [ID]

OPTIONS
  -h, --here                             sets project-root to current working directory
  -q, --quiet
  -v, --verbose                          shows output for each stage of the job.

  --build-mode=build-mode                [default: reuse-image] specify how to build stack. Options include
                                         "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --expose

  --label=label                          [default: ] additional labels to append to job

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --override-entrypoint                  forces container entrypoint to be sh shell. This may be useful for images that
                                         where not designed for cjr.

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --resource=resource

  --server-port=server-port              [default: auto] default port for the jupyter server

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --tunnel                               tunnel remote traffic through ssh

  --visible-stacks=visible-stacks        if specified only these stacks will be affected by this command

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/job/jupyter/start.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/jupyter/start.ts)_

## `cjr job:jupyter:stop [ID]`

Stop a running Jupyter server.

```
USAGE
  $ cjr job:jupyter:stop [ID]

OPTIONS
  -h, --here                       sets project-root to current working directory
  -q, --quiet
  -v, --verbose                    shows output for each stage of the job.
  --all                            stop all jupyter servers running in host directories
  --explicit
  --project-root=project-root
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/jupyter/stop.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/jupyter/stop.ts)_

## `cjr job:log [ID]`

Print console output generated by a job.

```
USAGE
  $ cjr job:log [ID]

OPTIONS
  --all                            show all output
  --explicit
  --lines=lines                    [default: 100]
  --no-autoload                    prevents cli from automatically loading flags using project settings files
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/log.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/log.ts)_

## `cjr job:ls`

List all running and completed jobs.

```
USAGE
  $ cjr job:ls

OPTIONS
  -v, --verbose                    shows all job properties.

  --all                            if this flag is added then list shows jobs from all stacks, regardless of whether
                                   stack flag is set

  --exited

  --explicit

  --json

  --no-autoload                    prevents cli from automatically loading flags using project settings files

  --resource=resource

  --running

  --stacks-dir=stacks-dir          override default stack directory

  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/ls.ts)_

## `cjr job:rm [ID]`

Delete a job and its associated data; works on both running and completed jobs.

```
USAGE
  $ cjr job:rm [ID]

OPTIONS
  -q, --quiet
  -v, --verbose
  --all
  --all-exited
  --all-running
  --explicit
  --no-autoload                    prevents cli from automatically loading flags using project settings files
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/rm.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/rm.ts)_

## `cjr job:shell [ID]`

Start an interactive shell to view or modify a job's files or outputs.

```
USAGE
  $ cjr job:shell [ID]

OPTIONS
  -v, --verbose                          shows output for each stage of the job.

  --build-mode=build-mode                [default: reuse-image] specify how to build stack. Options include
                                         "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --label=label                          [default: ] additional labels to append to job

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --resource=resource

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --visible-stacks=visible-stacks        if specified only these stacks will be affected by this command

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/job/shell.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/shell.ts)_

## `cjr job:start COMMAND`

Start a job that runs a shell command.

```
USAGE
  $ cjr job:start COMMAND

OPTIONS
  -q, --quiet
  -v, --verbose                          shows output for each stage of the job.
  --async
  --autocopy                             automatically copy files back to the project root on exit

  --build-mode=build-mode                [default: cached] specify how to build stack. Options include "reuse-image",
                                         "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --file-access=volume|shared            [default: volume] how files are accessed from the container.

  --here                                 sets project-root to current working directory

  --label=label                          [default: ] additional labels to append to job

  --message=message                      use this flag to tag a job with a user-supplied message

  --no-autocopy                          do not copy files back to the project root on exit

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --resource=resource

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --sync

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/job/start.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/start.ts)_

## `cjr job:state ID`

Get the current state of a job.

```
USAGE
  $ cjr job:state ID

OPTIONS
  --explicit
  --no-autoload                    prevents cli from automatically loading flags using project settings files
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/state.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/state.ts)_

## `cjr job:stop [ID]`

Stop a running job. This command has no effect on completed jobs.

```
USAGE
  $ cjr job:stop [ID]

OPTIONS
  -q, --quiet
  -v, --verbose
  --all                            stop all running jobs
  --explicit
  --no-autoload                    prevents cli from automatically loading flags using project settings files
  --resource=resource
  --stacks-dir=stacks-dir          override default stack directory
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/job/stop.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/job/stop.ts)_

## `cjr jupyter:ls`

List running jupiter servers.

```
USAGE
  $ cjr jupyter:ls

OPTIONS
  --explicit
  --json
```

_See code: [src/commands/jupyter/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/jupyter/ls.ts)_

## `cjr jupyter:start [PROJECT-ROOT]`

Start a Jupyter server.

```
USAGE
  $ cjr jupyter:start [PROJECT-ROOT]

OPTIONS
  -h, --here                             sets project-root to current working directory
  -q, --quiet
  -v, --verbose                          shows output for each stage of the job.

  --build-mode=build-mode                [default: reuse-image] specify how to build stack. Options include
                                         "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --expose

  --label=label                          [default: ] additional labels to append to job

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --override-entrypoint                  forces container entrypoint to be sh shell. This may be useful for images that
                                         where not designed for cjr.

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --server-port=server-port              [default: auto] default port for the jupyter server

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/jupyter/start.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/jupyter/start.ts)_

## `cjr jupyter:stop [PROJECT-ROOT]`

Stop a running Jupyter server.

```
USAGE
  $ cjr jupyter:stop [PROJECT-ROOT]

OPTIONS
  -h, --here                   sets project-root to current working directory
  -q, --quiet
  -v, --verbose                shows output for each stage of the job.
  --all                        stop all jupyter servers running in host directories
  --explicit
  --project-root=project-root
```

_See code: [src/commands/jupyter/stop.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/jupyter/stop.ts)_

## `cjr pconfig:item-append`

Adds one element to an array configuration property

```
USAGE
  $ cjr pconfig:item-append

OPTIONS
  -q, --quiet
  --default-profile=default-profile
  --project-root=project-root        location where settings should be written

  --stack=stack                      profile will only activate for stacks matching this name. If this flag is not
                                     supplied, profile will apply to all stacks

  --visible-stack=visible-stack
```

_See code: [src/commands/pconfig/item-append.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/pconfig/item-append.ts)_

## `cjr pconfig:item-remove`

Removes one element of an array configuration property.

```
USAGE
  $ cjr pconfig:item-remove

OPTIONS
  -q, --quiet
  --default-profile=default-profile
  --project-root=project-root        location where settings should be written

  --stack=stack                      profile will only activate for stacks matching this name. If this flag is not
                                     supplied, profile will apply to all stacks

  --visible-stack=visible-stack
```

_See code: [src/commands/pconfig/item-remove.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/pconfig/item-remove.ts)_

## `cjr pconfig:ls`

List all project settings.

```
USAGE
  $ cjr pconfig:ls

OPTIONS
  --no-autoload                prevents cli from automatically loading flags using project settings files
  --project-root=project-root  location where settings should be written
```

_See code: [src/commands/pconfig/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/pconfig/ls.ts)_

## `cjr pconfig:profile:add [PATH]`

Copies a configuration file into the current project profile directory.

```
USAGE
  $ cjr pconfig:profile:add [PATH]

OPTIONS
  --project-root=project-root
```

_See code: [src/commands/pconfig/profile/add.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/pconfig/profile/add.ts)_

## `cjr pconfig:rm`

Remove one or more project settings.

```
USAGE
  $ cjr pconfig:rm

OPTIONS
  -q, --quiet
  --default-profiles           remove all additional overriding configuration files for project stack
  --project-root=project-root  location where settings should be written
  --project-root-auto          remove auto load for project
  --resource                   remove default resource for project
  --stack                      remove default stack for project
  --stacks-dir                 remove any overriding default stack directory for project
  --visible-stacks             if specified only these stacks will be affected by this command
```

_See code: [src/commands/pconfig/rm.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/pconfig/rm.ts)_

## `cjr pconfig:set`

Overwrite one or more project settings.

```
USAGE
  $ cjr pconfig:set

OPTIONS
  -q, --quiet
  --project-root=project-root      location where settings should be written
  --project-root-auto
  --resource=resource              default resource for project
  --stack=stack                    default stack for project
  --stacks-dir=stacks-dir          override default stack directory for project
  --visible-stacks=visible-stacks  if specified only these stacks will be affected by this command
```

_See code: [src/commands/pconfig/set.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/pconfig/set.ts)_

## `cjr resource:add RESOURCE`

Add a remote resource.

```
USAGE
  $ cjr resource:add RESOURCE

OPTIONS
  --address=address          (required)
  --copy-key
  --key=key
  --storage-dir=storage-dir  location where job data is stored on remote host.
  --type=ssh                 (required)
  --username=username        (required)
```

_See code: [src/commands/resource/add.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/resource/add.ts)_

## `cjr resource:ls`

List all remote resources.

```
USAGE
  $ cjr resource:ls

OPTIONS
  -v, --verbose  show all properties for each remote resource.
```

_See code: [src/commands/resource/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/resource/ls.ts)_

## `cjr resource:rm RESOURCE`

Remove a remote resource.

```
USAGE
  $ cjr resource:rm RESOURCE
```

_See code: [src/commands/resource/rm.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/resource/rm.ts)_

## `cjr resource:set RESOURCE`

Set a remote resource parameter.

```
USAGE
  $ cjr resource:set RESOURCE

OPTIONS
  --address=address
  --option-key=option-key      [default: ]
  --option-value=option-value  [default: ]
  --type=ssh
  --username=username
```

_See code: [src/commands/resource/set.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/resource/set.ts)_

## `cjr resource:ssh [RESOURCE]`

ssh into a remote resource.

```
USAGE
  $ cjr resource:ssh [RESOURCE]

OPTIONS
  -X, --x11
  --explicit
  --resource=resource
```

_See code: [src/commands/resource/ssh.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/resource/ssh.ts)_

## `cjr shell`

Start an interactive shell for development on localhost.

```
USAGE
  $ cjr shell

OPTIONS
  -h, --here                             sets project-root to current working directory
  -v, --verbose                          shows output for each stage of the job.

  --build-mode=build-mode                [default: reuse-image] specify how to build stack. Options include
                                         "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/shell.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/shell.ts)_

## `cjr stack:build [STACK]`

Manually build an image for a stack.

```
USAGE
  $ cjr stack:build [STACK]

OPTIONS
  -q, --quiet
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --no-cache
  --profile=profile            set stack profile
  --project-root=project-root
  --pull
  --resource=resource
  --stack=stack
  --stacks-dir=stacks-dir      override default stack directory
```

_See code: [src/commands/stack/build.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/stack/build.ts)_

## `cjr stack:create NAME`

Initialize a project in the current directory.

```
USAGE
  $ cjr stack:create NAME

OPTIONS
  --dockerfile=dockerfile  Create a new stack with using this Dockerfile.
  --explicit
  --image=image            Create a new stack based on an existing docker Image.
  --snapshot               Create a new stack that supports snapshots.
  --stacks-dir=stacks-dir  override default stack directory
```

_See code: [src/commands/stack/create.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/stack/create.ts)_

## `cjr stack:ls`

List all the stacks in the stacks directory.

```
USAGE
  $ cjr stack:ls

OPTIONS
  --stacks-dir=stacks-dir  override default stack directory
```

_See code: [src/commands/stack/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/stack/ls.ts)_

## `cjr stack:pull URL`

Clones or pulls a stack using git directly into the stack folder.

```
USAGE
  $ cjr stack:pull URL

OPTIONS
  --explicit
  --stacks-dir=stacks-dir  override default stack directory
```

_See code: [src/commands/stack/pull.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/stack/pull.ts)_

## `cjr stack:rmi [STACK]`

Delete an image one or more stacks.

```
USAGE
  $ cjr stack:rmi [STACK]

OPTIONS
  -q, --quiet
  --all-configurations
  --config-files=config-files  [default: ] additional configuration file to override stack configuration
  --explicit
  --stack=stack
  --stacks-dir=stacks-dir      override default stack directory
```

_See code: [src/commands/stack/rmi.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/stack/rmi.ts)_

## `cjr stack:snapshot [STACK]`

Start an interactive shell for development on localhost.

```
USAGE
  $ cjr stack:snapshot [STACK]

OPTIONS
  -h, --here                             sets project-root to current working directory
  -v, --verbose                          shows output for each stage of the job.

  --build-mode=build-mode                [default: reuse-image] specify how to build stack. Options include
                                         "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/stack/snapshot.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/stack/snapshot.ts)_

## `cjr theia:ls`

List Running theia servers.

```
USAGE
  $ cjr theia:ls

OPTIONS
  --explicit
  --json
```

_See code: [src/commands/theia/ls.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/theia/ls.ts)_

## `cjr theia:start [PROJECT-ROOT]`

Start a Theia server.

```
USAGE
  $ cjr theia:start [PROJECT-ROOT]

OPTIONS
  -h, --here                             sets project-root to current working directory
  -q, --quiet
  -v, --verbose                          shows output for each stage of the job.

  --build-mode=build-mode                [default: reuse-image] specify how to build stack. Options include
                                         "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"

  --config-files=config-files            [default: ] additional configuration file to override stack configuration

  --explicit

  --expose

  --label=label                          [default: ] additional labels to append to job

  --no-autoload                          prevents cli from automatically loading flags using project settings files

  --override-entrypoint                  forces container entrypoint to be sh shell. This may be useful for images that
                                         where not designed for cjr.

  --port=port                            [default: ]

  --profile=profile                      set stack profile

  --project-root=project-root

  --server-port=server-port              [default: auto] default port for the jupyter server

  --stack=stack

  --stacks-dir=stacks-dir                override default stack directory

  --working-directory=working-directory  [default: /home/vagrant/cjr] cli will behave as if it was called from the
                                         specified directory

  --x11
```

_See code: [src/commands/theia/start.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/theia/start.ts)_

## `cjr theia:stop [PROJECT-ROOT]`

Stop a running Theia server.

```
USAGE
  $ cjr theia:stop [PROJECT-ROOT]

OPTIONS
  -h, --here                   sets project-root to current working directory
  -q, --quiet
  -v, --verbose                shows output for each stage of the job.
  --all                        stop all jupyter servers running in host directories
  --explicit
  --project-root=project-root
```

_See code: [src/commands/theia/stop.ts](https://github.com/container-job-runner/cjr/blob/v0.4.2/src/commands/theia/stop.ts)_
<!-- commandsstop -->
