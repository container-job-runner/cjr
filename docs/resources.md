Remote Resources
========================================================

Cjr can be used to run jobs on localhost and on remote resources. cjr currently supports remote resources that can be accessed through ssh. To add a remote resource you will need:
1. The IP address and username used to access the remote box over ssh.
2. The private key file used for ssh.
3. Podman or Docker must be installed on the remote resource.

To view a list of all the remote resource added to cjr, run the command
```console
$ cjr resource:ls
```
A new remote resource can be added with 
```console
$ cjr resource:add NAME --address=IP_ADDRESS --user=SSH_USERNAME --key=PATH_TO_KEYFILE --copy-key --type=ssh
```
Currently the only supported value for the --type flag is ssh. The copy-key flag is optional; if `--copy-key` is present then cjr will copy the key inside the directory *~/.config/.cjr/keys*.
You can verify that your remote resource is configured properly by running the command 
```console
$ cjr resource:ssh NAME
```
which will connect to your remote resource using ssh. The settings for any remote resource can be modified using the command 
```console
$ cjr resource:set --address=NEW_IP_ADDRESS --user=NEW_SSH_USERNAME --key=NEW_PATH_TO_KEYFILE --type=NEW_TYPE
```

All resources has additional options that can be set using the `cjr resource:set` command. In order to properly use a remote resource with `type=ssh` you will need to configure at least one option.
First you must decide if you want to use podman or docker on the remote resource.
```console
$ cjr resource:set NAME --option-key=engine --option-value=docker      # if docker is installed on the remote resource
$ cjr resource:set NAME --option-key=engine --option-value=podman      # if podman is installed on the remote resource
```
If selinux is active on the remote resource then you must also run the command
```console
$ cjr resource:set NAME --option-key=selinux --option-value=true
```
or bind mounts will not be created with the correct permissions and remote commands will fail.

## Running Remote jobs

All of the job commands support the flag `--resource` which can be used to run jobs on remote resources that can be accessed using ssh. 
If resource is set to a remote box, then cjr will use ssh to transfer job files with rsync, and issue podman or docker commands on the remote host.
To run jobs on localhost, the resource flag can either be left blank or it can be set to "localhost"

The following two commands demonstrate how to start a job that runs lscpu on localhost and on a remote resource
```console
$ cjr $ lscpu --resource=localhost --stack=fedora:latest  # run on localhost
$ cjr $ lscpu --resource=NAME --stack=fedora:latest       # run on resource named NAME
```
*TIP*: You can set the default resource in a project using the command `cjr pconfig:set --resource=NAME`