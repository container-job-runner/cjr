import { DockerSocketRunDriver } from '../docker/docker-socket-run-driver';
import { PodmanAPIPostProcessor } from './podman-socket-build-driver';

// ===========================================================================
// Podman-Run-Driver: Controls Podman Socket For Running containers
// ===========================================================================

export class PodmanSocketRunDriver extends DockerSocketRunDriver
{
  protected base_command: string = "podman"
  protected curlPostProcessor = PodmanAPIPostProcessor

  // NOTE: once official podman doc is released, addApiCreateObjectMisc needs to enable flags "userns"
  // protected addApiCreateObjectMisc(configuration: DockerStackConfiguration, create_object: DockerAPI_CreateObject)
  // {
  //   super.addApiCreateObjectMisc(configuration, create_object)
  //   // -- User Namespace -------------------------------------------------------
  //   if(["auto","host","keep-id"].includes(configuration.config?.flags?.['podman-userns'] || "")) {
  //     create_object.userns = {"nsmode": configuration.config?.flags?.['podman-userns']}
  //   }
  //   // -- Security options -----------------------------------------------------
  //   if(run_object?.flags?.["security-opt"]) {
  //     // DO SOMETHING
  //   }
  //}

}
