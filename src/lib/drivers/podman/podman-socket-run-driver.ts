// ===========================================================================
// Podman-Run-Driver: Controls Podman Socket For Running containers
// ===========================================================================

import {Dictionary} from '../abstract/run-driver'
import {DockerSocketRunDriver} from '../docker/docker-socket-run-driver'
import {PodmanStackConfiguration} from '../../config/stacks/podman/podman-stack-configuration'

export class PodmanSocketRunDriver extends DockerSocketRunDriver
{

  emptyConfiguration()
  {
    return new PodmanStackConfiguration()
  }

}
