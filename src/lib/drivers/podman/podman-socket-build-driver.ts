import {Dictionary} from '../abstract/build-driver'
import {DockerSocketBuildDriver} from '../docker/docker-socket-build-driver'
import {PodmanStackConfiguration} from '../../config/stacks/podman/podman-stack-configuration'

export class PodmanSocketBuildDriver extends DockerSocketBuildDriver
{
    emptyConfiguration()
    {
      return new PodmanStackConfiguration()
    }

}
