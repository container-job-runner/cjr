import { DriverInitDockerConfig } from '../abstract/driver-init-docker-config';
import { ShellCommand } from '../../shell-command';
import { DockerSocketBuildDriver } from '../../drivers-containers/docker/docker-socket-build-driver';
import { PodmanSocketBuildDriver } from '../../drivers-containers/podman/podman-socket-build-driver';
import { PodmanSocketRunDriver } from '../../drivers-containers/podman/podman-socket-run-driver';
import { DockerSocketRunDriver } from '../../drivers-containers/docker/docker-socket-run-driver';

export class SocketDriverInit extends DriverInitDockerConfig
{
    drivers(type: "podman"|"docker", options: {"socket": string, "build-directory": string, "selinux": boolean}, shell:ShellCommand)
    {
        return {
            "builder": this.newBuildDriver(type, shell, options),
            "runner":  this.newRunDriver(type, shell,  options)
        }
    }
    
    private newBuildDriver(type: "docker"|"podman", shell: ShellCommand, options: {"build-directory": string, "socket": string}) : DockerSocketBuildDriver | PodmanSocketBuildDriver
    {        
        if(type === "podman")
            return new PodmanSocketBuildDriver(shell, options);
        else
            return new DockerSocketBuildDriver(shell, options);
    }

    private newRunDriver(type: "docker"|"podman", shell: ShellCommand, options: {"selinux": boolean, "socket": string}) : PodmanSocketRunDriver | DockerSocketRunDriver
    {
        if(type === "podman")
            return new PodmanSocketRunDriver(shell, options);
        else
            return new DockerSocketRunDriver(shell, options);
    
    }    
}