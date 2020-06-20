import { SshShellCommand } from '../../remote/ssh-shell-command';
import { DockerCliBuildDriver } from '../../drivers-containers/docker/docker-cli-build-driver';
import { PodmanCliBuildDriver } from '../../drivers-containers/podman/podman-cli-build-driver';
import { DockerCliRunDriver } from '../../drivers-containers/docker/docker-cli-run-driver';
import { PodmanCliRunDriver } from '../../drivers-containers/podman/podman-cli-run-driver';
import { ShellCommand } from '../../shell-command';
import { DriverInitDockerConfig } from '../abstract/driver-init-docker-config';

export class CliDriverInit extends DriverInitDockerConfig
{
    drivers(type: "podman"|"docker", options: {"selinux": boolean}, shell:ShellCommand|SshShellCommand)
    {
        return {
            "builder": this.newBuildDriver(type, shell),
            "runner":  this.newRunDriver(type, shell,  options)
        }
    }
    
    private newBuildDriver(type: "podman"|"docker", shell: ShellCommand|SshShellCommand) : DockerCliBuildDriver | PodmanCliBuildDriver
    {
        if(type === "podman")
            return new PodmanCliBuildDriver(shell);
        else
            return new DockerCliBuildDriver(shell);
    }

    private newRunDriver(type: "podman"|"docker", shell: ShellCommand|SshShellCommand, options: {"selinux": boolean}) : DockerCliRunDriver | PodmanCliRunDriver
    {
        if(type === "podman")
            return new PodmanCliRunDriver(shell, options);               
        else
            return new DockerCliRunDriver(shell, options);
    }    
}