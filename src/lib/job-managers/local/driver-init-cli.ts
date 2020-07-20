import { SshShellCommand } from '../../ssh-shell-command';
import { DockerCliBuildDriver } from '../../drivers-containers/docker/docker-cli-build-driver';
import { PodmanCliBuildDriver } from '../../drivers-containers/podman/podman-cli-build-driver';
import { DockerCliRunDriver } from '../../drivers-containers/docker/docker-cli-run-driver';
import { PodmanCliRunDriver } from '../../drivers-containers/podman/podman-cli-run-driver';
import { ShellCommand } from '../../shell-command';
import { DriverInitDockerConfig } from '../abstract/driver-init-docker-config';

export class DriverInitCli extends DriverInitDockerConfig
{
    drivers(shell: ShellCommand|SshShellCommand, options: {"engine": "podman" | "docker", "selinux": boolean})
    {
        return {
            "builder": this.newBuildDriver(options.engine, shell),
            "runner":  this.newRunDriver(options.engine, shell,  options)
        }
    }
    
    private newBuildDriver(engine: "podman"|"docker", shell: ShellCommand|SshShellCommand) : DockerCliBuildDriver | PodmanCliBuildDriver
    {
        if(engine === "podman")
            return new PodmanCliBuildDriver(shell);
        else
            return new DockerCliBuildDriver(shell);
    }

    private newRunDriver(engine: "podman"|"docker", shell: ShellCommand|SshShellCommand, options: {"selinux": boolean}) : DockerCliRunDriver | PodmanCliRunDriver
    {
        if(engine === "podman")
            return new PodmanCliRunDriver(shell, options);               
        else
            return new DockerCliRunDriver(shell, options);
    }    
}