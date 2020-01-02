
import {DockerConfiguration} from './docker-configuration'

// Class for docker configuration
export class PodmanConfiguration extends DockerConfiguration
{

  runObject()
  {
    var run_object = super.runObject()
    if(this.raw_object?.podman) run_object.podman = this.raw_object.podman
    return run_object
  }

}

// NOTE: this class currently validates its object using the docker-configuration-schemas
// this means that it does not check podman object for valid fields. Once a good way to merge schemes
// is found then create a podman-configuration-schema and overload validate function to this class.
