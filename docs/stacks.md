Stacks
========================================================

Stacks are directories that contain all the information necessary to build a container image. Two official cjr stacks are the [clear-linux-stack](https://github.com/container-job-runner/stack-clear-basic) and the [fedora-basic-stack](https://github.com/container-job-runner/stack-fedora-basic). This documentation is aimed at anyone that wants to create their own cjr stack.

Stacks typically contain the following files and folder folders:

1. **build** - a folder that contains a Dockerfile and any other files needed during the container build stage.
2. **config.yml** - the primary configuration for the stack. 
3. **profiles:** - additional stack configurations files that can be activated by the user using the flags `--profile`. They are discussed in more detail at the end of this doc.

A stack directory may also contain any number of additonal files or folders.  Broadly speaking there are two main kinds of stack.
1. *Dockerfile stacks* that contain a build directory with a Dockerfile
2. *Image-based stacks* that only contain a configuration that references a container image from a registry.
3. *Snapshottable stacks* are a special kind of image-based stack can be incrementally modified. They are described in more detail in the [snapshot](##Snapshottable-Stacks) section.

You can create empty templates for each type of stack using the command
```console
cjr stack:create $STACKNAME
```
The flag `--dockerfile=$PATH_TO_DOCKERFILE` creates an empty Dockerfile-based stack, the flag `--image=$IMAGE` creates an image-based stack, and the flag `--snapshot` creates an snapshotable stack.

Next we describe the build directory and the specification for config.yml in more detail.

The Build Directory
-------------------
This directory is mandatory for a Dockerfile stack. The Dockerfile should be placed directly in the build directory and named 'Dockerfile'. The build directory should also contain all additional files or folders that are referenced from the Dockerfile during the build.  For those familiar with Docker, the build directory path is used as the build-context.
For Image-based stacks, the build directory can be ommitted.

YML Specification for config.yml
---------------------

Stack directories may contain a configuration file named `config.yml`. This file is manaditory for image-based stacks and optional for Dockerfile stacks. All the fields in this file are optional. The full set of fields is:
```yaml
version: STRING
build:
  image: STRING
  no-cache: STRING
  pull: STRING
  args: OBJECT_OF_STRINGS
  args-dynamic: OBJECT_OF_STRINGS
  auth:
    user: STRING
    token: STRING
    password: STRING
entrypoint: ARRAY_OF_STRINGS
environment: OBJECT_OF_STRINGS  
environment-dynamic: OBJECT_OF_STRINGS
mounts: ARRAY_OF_OBJECTS
ports: ARRAY_OF_OBJECTS
files:
  containerRoot: STRING
  rsync:
    upload-exclude-from: STRING
    upload-include-from: STRING
    download-exclude-from: STRING
    download-include-from: STRING
snapshot:
  mode: "prompt" | "always"
  storage-location: "remote" | "archive"
  auth:
    user: STRING
    token: STRING
    password: STRING
resources:
  cpus: STRING
  memory: STRING
  memory-swap: STRING
  gpus: STRING
flags: OBJECT_OF_STRINGS
```

### `version` : string

Configuration file version. Currently the only supported value is  `"1.0"`.

### `build.image` : string

Image that should be used to run container. If this field is specified, any Dockerfiles in the build directory will be ignored.

### `build.no-cache` : boolean

If no-cache is set to true then image will always build with the flag `--no-cache`

### `build.pull` : boolean

If pull is set to true then image will always build with the flag `--pull`

### `build.args` : { [key: string] : string}

Contains arguments used during image build. For example
```yaml
build:
  args:
    ARG1: VALUE1
    ARG2: VALUE2
```
will build a container using the arguments ARG1=VALUE1 and ARG2=VALUE2.

### `build.args-dynamic` : { [key: string] : string}

Contains arguments that should be dynamically evaluated on the host before build command is run. Cjr will evaluate these args by running the comand `echo "VALUE"`. For example, 
```yaml
build:
  args-dynamic:
    ARG1: "$(id -u)"
    ARG2: "$(id -g)"
```
will build the container using the arguments ARG1 and ARG2 that will be set to the host user id and group id.

**WARNING**: dynamic args allow for arbitary code execution on the host box. Always verify dynamic args if you download stacks form remote sources.

### `build.auth` : { username : string , server : string, token : string}

The auth field contains all the information for pulling an image that is stored in a private repository. This field can be ommited if the image is stored in a public repository, 
```yaml
build:
  image: "image:tag"
  auth:
    username: "user"
    server: "https://index.docker.io/v1/"
    token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
The token field can be either be an access [token](https://docs.docker.com/docker-hub/access-tokens/) (recommended) or an account password (not recommended).

### `entrypoint` : string[]

Entrypoint for the container. For example,
```yaml
entrypoint: 
- "/bin/bash"
- "-c"
```

### `environment` : { [key: string] : string }

A list of environment variables that will be passed to container on start. For example,
```yaml
environment:
  ARG1: VALUE1
  ARG2: VALUE2
```
will set the following the environemt variables ARG1=VALUE1 and ARG2=VALUE2 in the container.


### `environment-dynamic` : { [key: string] : string }

A list of environment variables should be dynamically evaluated on the host before a container is started. For example,
```yaml
environment-dynamic:
    ARG1: "$(id -u)"
    ARG2: "$(id -g)"
```
will set the start a container with environemt variables ARG1 and ARG2 that will be set to the host user id and group id.

**WARNING**: dynamic args allow for arbitary code execution on the host box. Always verify dynamic args if you download stacks form remote sources.


### `mounts` : Array<{type: "bind"|"volume"|"tempfs", hostPath: string, containerPath: string, readonly?: boolean, selinux?: boolean}>

There are three type of supported mounts: binds, volumes, and tempfs.

**1. Binds**:  The file or directory on the host machine is mounted into a container. Any changes made in the container will be immediately visible on the host. Binds have three required properties and four optional properties:
1. *type:* - must be equal to `bind`
2. *hostPath* - path on host that should be mounted inside container
3. *containerPath* - path on container where host path will be mounted to
4. *readonly* (Optional) - `true` or `false`
5. *consistency* (Optional) - can be either `consistent` or `delegated` or `cached`. Only affects docker on Mac.
6. *selinux* (Optional) - `true` or `false`. if true, then :z will be added to mount. If false :z will never be added to mount (even if settings selinux is set to true)
7. *remoteUpload* (Optional) - `true` or `false`. If true hostPath will be uploaded to remote resources during job runs

Example
```yaml
mounts:
- type: bind
  hostPath: /home/user/folder
  containerPath: /folder
```

**2. Volumes**: Similar to a bind, except it utilizes a storage folder that is managed by Docker or Podman. Volumes have three required properties and one optional properties:
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

**3. Tempfs**: A temporary filesystem that resides in the host's memory. Tempfs mounts have two required properties:
1. *type* - must be equal to `tempfs`
2. *containerPath* - path on container where the volume path will be mounted to

Example
```yaml
mounts:
- type: tempfs
  containerPath: /folder
```

### `ports` : Array<{hostPort: string, containerPort: string, hostIP?: string}>

A mapping of ports from host to container. Example:
```yaml
ports:
- hostPort: 8080
  containerPort: 8080
  hostIP: 127.0.0.1
- hostPort: 20
  containerPort: 2020
```
**WARNING**: Due to port collisions, it is not possible to run multiple containers pertaining to a stack with open ports. If you configure ports then only only 1 job can be run at a time, and the shell and $ commands cannot be used simultaneously.

### `resources` : {cpus?: string, memory?: string, gpus?: string, memory-swap?: string}
The resource field allows you to limit the resources that each container can use

1. *cpus* - (optional) max number of CPU cores; can be decimal (e.g. 1.5)
2. *memory* - (optional) maximum amount of memory; for example `200m` for 200 MB and `4g` for 4 GB.
3. *gpus* - (optional) set to `all` to access all GPUs from container. See https://docs.docker.com/config/containers/resource_constraints/ for more details
4. *memory-swap* - (optional) maximum amount of memory including swap. Requires memory to be set.

Example:
```yaml
resources:
  cpus: "1"
  memory: "200m"
  memory-swap: "400m"
  gpus: all
```
**WARNING**: Enabling resource management requires root privileges in Podman.

### `files` : {containerRoot: string, rsync: {upload-exclude-from?: string, upload-include-from?: string, download-exclude-from?: string, download-include-from?: string }}

1. *containerRoot* - default containerRoot for stacks. A project root will be mounted inside this directory when running commands `cjr job:start` and `cjr shell`.
2. *rsync* - rsync include and exclude files for upload and download. Upload files are used when job data files are transferred to a volume or remote resource during job creation. Download files are used when job data is copied back from a volume or remote resource back to a host file. The fields for specifying these files are *"upload-exclude-from"*, *"upload-include-from"*, *"download-exclude-from"*, *"download-include-from"*.

Example:
```yaml
files:
  containerRoot: "/"
  rsync:
    upload-exclude-from: "path/to/upload-exclude-file"
    upload-include-from: "path/to/upload-incude-file"
    download-exclude-from: "path/to/download-exclude-file"
    download-include-from: "path/to/download-include-file"
```

### `flags` : { [key: string] : string}

Flags contains special options for a stack. Some flags will only be picked up by a specific container engine. A full list of the currently supported flags is:

**Docker Specific**

1. *docker-chown-file-volume* (string) if this flag is set to "host-user", then job file volumes will be chowned to the id of the host user (i.e. `id -u`). If this value is set to a numerical value such as "20" then the job file volumes will be chowned to user 20. This flag should be used for all images that run with non root users.
2. *docker-privileged* ("true" | "false") use the docker flag --privileged only for docker

**Podman Specific**

1. *podman-security-opt* (string) same as podman --security-opt flag
2. *podman-userns* (string) same as podman --userns flag (e.g. setting `userns: host` preserves mapping of user ids on host and in container).
3. *podman-privileged* ("true" | "false") use the flag --privileged only for podman
4. *podman-chown-file-volume* (string) if this flag is set to "host-user", then job file volumes will be chowned to the id of the host user (i.e. `id -u`). If this value is set to a numerical value such as "20" then the job file volumes will be chowned to user 20. This flag should be used for all images that run with non root users. Note: for rootless podman ids are relative to the default userns mapping.
5. *podman-chown-binds* (string) **EXPERIMENTAL** setting that currently only applies to stacks running remotely. String should be of format "$UID:$GUI" where $UID and $GUI are number representing the user id and group id of the container user. If this flag is set, then podman unshare command will be run on any bound directories before a job is started. 

**General**

1. *cmd-args* (string) if this flag is set to "join", then commands inputed into job:start or job:exec will be joined into a single strings. This is useful if the container has an shell entrypoint like `["/bin/bash", "-c"]` since it prevents the user from adding quotes to `job:start` commands.
2. *user* (string) container will run with this user. This flag was primarily added for snapshottable stacks with non root users.
3. *mac-address* (string) same as Docker --mac-address flag. a mac address of the container. Note: requires rootfull podman.
4. *network* (string) same as Docker --network flag
5. *privileged* ("true" | "false") equivalent to the Docker flag --privileged

### `snapshot` : { mode: "always"|"prompt", username: string, server: string, token: string}

Snapshot contains the options for snapshotting a stack that will be used by the command `cjr stack:snapshot`. Note that snapshottable stacks normally have an image that is of the form `username/$IMAGENAME:latest` where $IMAGENAME can be anything. The field descriptions are:

1. *mode*: if set to 'always' `stack:snapshot` command always creates a snapshot on exit. If set to `prompt` `stack:snapshot` asks the user whether to create a snapshot.
2. *username*: username for registry account where snapshottable stack will be pushed
3. *server*: address of auth server for container registry 
4. *token*: access token for user to access registry

## Profiles

Stack configurations can be merged using profiles. For example, suppose we have a stack named fedora in our stacks directory that contains the following *config.yml* file:
```yaml
build:
  image: fedora:latest
```
Next suppose we also place an additional configuration file `bind.yml` that is located in our stack's *profile* directory:
```yaml
mounts:
  - type: bind
    hostPath: "./container-home"
    containerPath: "/home/user"
```
The two configurations can be merged together using the `--profile` flag. For example, the commmand
```console
$ cjr job:start $CMD --stack=fedora --profile=bind
```
merges the two configurations and runs the command $CMD in a container created from the image fedora:latest with a bind mount on "/home/user".
By placing several different configuration files in the stack profiles directory, the user has the ability to dynamically choose between different configurations, 
and the stack creator does not need to duplicate all the fields for each confiugration.


In general, cjr looks for profiles in two places:
- the project root in .cjr/profiles
- inside the profiles directory in the user selected selected stack
The user can also configure which profiles get automatically added to a stack inside a specific project.

## Snapshottable Stacks

A snapshotable stack starts with from a base image, generally from a remote repository, and provide a simple way for you to incrementally make modifications to an image. 
There are two types of snapshottable stacks: those with images that are stored on a remote container registry, and those with images that are stored locally as .tar.gz files.

#### Remote snapshottable stacks
These type of stacks store their images on a remote container registry. Each time you create a new snapshot, cjr will push the changes to a container registry. The repository will have the same name as the stack and the tags will coorespond to the unix timestamps when a snapshot was taken.
To use these types of stacks you will need to have an account on a container registry like DockerHub.

#### Remote snapshottable stacks
These types of stacks store their images inside the stack folder in the subdirectory *snapshots*. No information is ever pushed to a remote repository, and no container registry account is needed.

#### Creating A snapshottable stack

To create a snapshottable stack that is based on an existing image $STARTINGIMAGE (e.g. STARTINGIMAGE=fedora:latest) use the command
```console
$ cjr stack:create $STACKNAME --image=$STARTINGIMAGE --snapshottable
```
The command starts an interactive dialog that prompts the user for more information
```console
$ cjr stack:create example --image=fedora:latest --snapshot
? Is fedora:latest a private image? No          # tell cjr if the image is accessible without a password                   
--------------------------------------------------------------------------------
  Auth settings to access private repository    # IMPORTANT: the next three prompts only appear for private images
--------------------------------------------------------------------------------
? Auth Server: https://index.docker.io/v1/      # container registry auth server (leave default for dockerhub) 
? Username: user                                # username for container registry
? Access Token: [hidden]                        # token for container registry
--------------------------------------------------------------------------------
  Snapshot Settings
--------------------------------------------------------------------------------
? Snapshot storage location (Use arrow keys)
❯ remote registry                               # select this if snapshot images are stored remotely
  local archive                                 # select this if snapshot images are stored locally
? Snapshot mode (Use arrow keys)
❯ always                                        # select this if you want the image to always save after running cjr stack:snapshot
  prompt                                        # select this if you want the image to prompt whether to save after running cjr stack:snapshot
--------------------------------------------------------------------------------
  Registry auth for storing snapshots           # IMPORATANT: this prompt only appears for remote snapshots
--------------------------------------------------------------------------------
? Auth Server: https://index.docker.io/v1/      # container registry auth server (leave default for dockerhub) 
? Username: user                                # username for container registry
? Access Token: [hidden]                        # token for container registry
? Is user/example a private repo? (Y/n)         # adds auth info to stack config if this repository is private
```
Cjr will then pull the base image, retag it as user/$IMAGENAME:latest and save it to a tar.gz file (if storage location is set to achive) or push it to your remote repository (if storage location is set to remote registry) . 
When you want to update the image, you can use the command
```console
$ cjr stack:snapshot $STACKNAME
```
This will open an interactive shell where you can install packages or make any other custom modifications. 
When you exit the shell cjr will commit the changes to a new container and save the changes to a new tar file or push the changes to your remote registry.

### Stack configuration yml for remote snapshots
A basic config.yml for a remote snapshotable stack looks roughly as follows:
```yaml
build:
  image: user/repo:latest          # the image is always user/repo:latest is always set to latest
snapshot:
  mode: 'prompt'
  storage-location: "remote"
  repository: repo
  auth:
    username: user
    server: https://index.docker.io/v1/ 
    token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
When cjr pushes a new snapshot to your remote repository it will be tagged as `user/$IMAGENAME:$UNIXTIME` where $UNIXTIME will be the current unix time. Cjr will also retag `user/$IMAGENAME:latest` to point to the latest snapshot.
You can manually configure a snapshotable without the stack:create $IMAGENAME by modeling of the yml shown above.

### Stack configuration yml for local snapshots
A basic config.yml for a local snapshotable stack looks roughly as follows:
```yaml
snapshot:
  mode: 'prompt'
  storage-location: "archive"
```
The stack directory should have an file image.tar.gz in the build directory and a subdirectory called snapshots. The command `stack:snapshot` will create a new image and save it as a compressed tar file named `image-$UNIXTIME.tar.gz` in the snapshots directory. To avoid file duplication, cjr then creates a hard symbolic link with the new snapshot as the source, and build/image.tar.gz as the target.