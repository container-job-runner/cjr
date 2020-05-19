import { DockerSocketRunDriver, DockerAPI_CreateObject } from '../docker/docker-socket-run-driver';
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration';

// ===========================================================================
// Podman-Run-Driver: Controls Podman Socket For Running containers
// ===========================================================================

export class PodmanSocketRunDriver extends DockerSocketRunDriver
{
  protected base_command: string = "podman"

  // NOTE: once official podman doc is released, addApiCreateObjectMisc needs to enable flags "userns"
  // protected addApiCreateObjectMisc(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  // {
  //   super.addApiCreateObjectMisc(configuration, create_object)
  //   // -- User Namespace -------------------------------------------------------
  //   if(["auto","host","keep-id"].includes(configuration.config?.flags?.userns || "")) {
  //     create_object.userns = {"nsmode": configuration.config?.flags?.userns}
  //   }
  //   // -- Security options -----------------------------------------------------
  //   if(run_object?.flags?.["security-opt"]) {
  //     // DO SOMETHING
  //   }
  //}

}
