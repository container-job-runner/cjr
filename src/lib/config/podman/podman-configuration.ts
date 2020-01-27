
import {DockerConfiguration} from '../docker/docker-configuration'

// Class for docker configuration
export class PodmanConfiguration extends DockerConfiguration
{
  protected valid_flag_fieldnames = ["network", "security-opt", "userns"]
}
