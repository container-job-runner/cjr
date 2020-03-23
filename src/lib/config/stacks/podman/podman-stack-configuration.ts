
import {DockerStackConfiguration} from '../docker/docker-stack-configuration'

// Class for docker configuration
export class PodmanStackConfiguration extends DockerStackConfiguration
{
  protected valid_flag_fieldnames = ["network", "security-opt", "userns", "mac-address", "net"]
}
