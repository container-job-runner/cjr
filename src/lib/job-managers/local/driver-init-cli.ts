import { SshShellCommand } from '../../ssh-shell-command';
import { DockerCliBuildDriver } from '../../drivers-containers/docker/docker-cli-build-driver';
import { PodmanCliBuildDriver } from '../../drivers-containers/podman/podman-cli-build-driver';
import { DockerCliRunDriver } from '../../drivers-containers/docker/docker-cli-run-driver';
import { PodmanCliRunDriver } from '../../drivers-containers/podman/podman-cli-run-driver';
import { ShellCommand } from '../../shell-command';
import { DriverInitDockerConfig } from '../abstract/driver-init-docker-config';

export class DriverInitCli extends DriverInitDockerConfig
{
    drivers(shell: ShellCommand|SshShellCommand, options: {"engine": "podman" | "docker", "selinux": boolean, "rootfull": boolean})
    {
        return {
            "builder": this.newBuildDriver(options.engine, shell, options),
            "runner":  this.newRunDriver(options.engine, shell,  options)
        }
    }
    
    private newBuildDriver(engine: "podman"|"docker", shell: ShellCommand|SshShellCommand, options: {"rootfull": boolean}) : DockerCliBuildDriver | PodmanCliBuildDriver
    {
        if(engine === "podman")
            return new PodmanCliBuildDriver(shell, options);
        else
            return new DockerCliBuildDriver(shell, options);
    }

    private newRunDriver(engine: "podman"|"docker", shell: ShellCommand|SshShellCommand, options: {"selinux": boolean, "rootfull": boolean}) : DockerCliRunDriver | PodmanCliRunDriver
    {
        if(engine === "podman")
            return new PodmanCliRunDriver(shell, options);               
        else
            return new DockerCliRunDriver(shell, options);
    }    
}