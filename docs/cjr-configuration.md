CJR Configuration
========================================================

All cjr settings can be viewed by running
```console
$ cjr config:ls
``` 
and modified using the command
```console
$ cjr config:set --propery-name=$VALUE
```
Multiple settings can be changed simultaneously by using additional flags. The full list of flags and their meanings is described below:

### User Experience
1. **always-print-job-id**: 'true' | 'false'  
If true, then command `cjr job:start` will always print the job id.
2. **auto-project-root**: 'true' | 'false'   
If true, then cjr will automatically traverse up the directory tree looking for *.cjr* directories where *.cjr/project-settings.yml* has project-root: "auto". If it finds such a project then it will set the default value of the flag `--project-root` to this directory.
3. **interactive**: 'true' | 'false'   
If true, then certain cjr commands will prompt the user with interactive menus.
4. **job-default-run-mode**: "async"|"sync"  
Determines whether new jobs run sync or async by default.
5. **job-ls-fields**: string  
Specifies which fields appear when running job:list. The string must be a comma separated list that contains any subset of the fields "id", "stack", "stackName", "status", "command", "message". For example:
`cjr config:set --job-ls-fields='id, stackName, command, status'`
6. **stacks-dir**: string  
The default path to a folder that contains cjr stacks.
7. **xquartz-autostart**: 'true' | 'false'  
Determines if cjr should try to auto start xQuartz on Mac when `--x11` flag is selected.

### Jobs
1. **autocopy-sync-job**: 'true' | 'false'  
If true, then cjr will automatically copy back data at the end of all synchronous jobs.
2. **run-shortcuts-file**: string
The location of a yml file that can be used to specify run shortcuts for `cjr job:start` command. See file format description below.


### Containers
1. **default-container-shell**: string  
The default shell that should be used in containers for job:shell commands (e.g. sh, bash, zsh).
2. **driver**: "podman-cli"|"docker-cli"|"docker-socket"|"podman-socket"  
The driver used to communicate with container engine. To use the docker engine, select docker drivers and to use the podman engine use podman drivers. Note that socket drivers are currently experimental.
3. **image-tag**: string  
tag that cjr will use when building images.
4. **selinux**: 'true' | 'false'   
If true, then the :Z option will be applied to all bind mounts. This option is should be set to true on all systems with selinux enabled or bind mounts will not function properly.
5. **socket-path**: string  
Location of the podman or docker socket that should be used by the drivers. This setting will only be used if driver is set to either podman-socket or dockersocket.

### Jupyter and Theia
1. **jupyter-command**: 'jupyter lab' | 'jupyter notebook'  
Command used to start a Jupyter server. This allows you to choose between Jupyter lab or Jupyter notebook.
2. **on-server-start**: string  
A command that should be run after a Jupyter or Theia server has started. When the command is run the environment variable $URL will contain the url of the server.
For example, 'xdg-open $URL' can be used to open the server in the default browser.
3. **timeout-jupyter**: number  
The maximum number of seconds to wait for a Jupyter server to start.
4. **timeout-theia**: number  
The number of seconds to wait for a Theia server to start.


### Snapshots
1. **container-registry-auth**: string  
The location of default container registry auth server for pushing snapshots.
2. **container-registry-user**: string  
The default container registry username for pushing snapshots.

## Run-Shortcuts File Specification

The run-shortcuts-file option allows you to define custom shortcuts for the `cjr $` command when called it's called with a single argument. For example you can map `cjr $ script.sh` to `cjr $ bash script.sh`. The yml file must correspond to an object with string keys and values. For example
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
This configuration enables the following shortcuts:
- `cjr $ script.sh` is now equivalent to `cjr $ bash script.sh`
- `cjr $ script.m`  is now equivalent t `cjr $ matlab -nosplash -nodisplay -nojvm -nodesktop script.m`
- `cjr $ script.py` is now equivalent t `cjr $ python script.py`