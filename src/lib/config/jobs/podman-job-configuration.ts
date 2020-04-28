import { JobConfiguration } from './job-configuration'
import { Dictionary } from '../../drivers/abstract/run-driver';
import { PodmanStackConfiguration } from '../stacks/podman/podman-stack-configuration';
import { DockerCLI_CreateObject, DockerAPI_CreateObject } from '../stacks/docker/docker-stack-configuration';

export class PodmanJobConfiguration extends JobConfiguration<PodmanStackConfiguration>
{
  // === START API Functions ===================================================

  apiContainerCreateObject() : DockerAPI_CreateObject // Returns Object for Docker API Create Endpoint
  {
    const job_props: DockerAPI_CreateObject = {
        "AttachStdin": true,
        "AttachStdout": true,
        "AttachStderr": true,
        "OpenStdin": true,
        "Tty": true,
        "Image": this.stack_configuration.getImage(),
        "Cmd": this.command,
        "WorkingDir": this.working_directory,
        "Labels": this.labels
      }

    return {
      ... this.stack_configuration.apiContainerCreateObject(),
      ... job_props
    }
  }

  // === END API Functions =====================================================

  // === START Docker Functions ================================================

  cliContainerCreateObject() : Dictionary // returns object for DockerRunDriver
  {
    return {
      ... this.stack_configuration.cliContainerCreateObject(),
      ... {
        "interactive": true,
        "command": this.command,
        "wd": this.working_directory,
        "detached": !this.synchronous,
        "remove": this.remove_on_exit,
        "labels": this.labels
      }
    }
  }

  // === END Docker Functions ==================================================

}
