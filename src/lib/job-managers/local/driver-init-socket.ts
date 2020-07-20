import { DriverInitDockerConfig } from '../abstract/driver-init-docker-config';
import { ShellCommand } from '../../shell-command';
import { DockerSocketBuildDriver } from '../../drivers-containers/docker/docker-socket-build-driver';
import { PodmanSocketBuildDriver } from '../../drivers-containers/podman/podman-socket-build-driver';
import { PodmanSocketRunDriver } from '../../drivers-containers/podman/podman-socket-run-driver';
import { DockerSocketRunDriver } from '../../drivers-containers/docker/docker-socket-run-driver';

export class DriverInitSocket extends DriverInitDockerConfig
{
    drivers(shell: ShellCommand, options: {"engine": "podman"|"docker", "socket": string, "build-directory": string, "selinux": boolean})
    {
        return {
            "builder": this.newBuildDriver(options.engine, shell, options),
            "runner":  this.newRunDriver(options.engine, shell,  options)
        }
    }
    
    private newBuildDriver(engine: "docker"|"podman", shell: ShellCommand, options: {"build-directory": string, "socket": string}) : DockerSocketBuildDriver | PodmanSocketBuildDriver
    {        
        if(engine === "podman")
            return new PodmanSocketBuildDriver(shell, options);
        else
            return new DockerSocketBuildDriver(shell, options);
    }

    private newRunDriver(engine: "docker"|"podman", shell: ShellCommand, options: {"selinux": boolean, "socket": string}) : PodmanSocketRunDriver | DockerSocketRunDriver
    {
        if(engine === "podman")
            return new PodmanSocketRunDriver(shell, options);
        else
            return new DockerSocketRunDriver(shell, options);
    
    }    
}