import { NewJobCommand } from './new-job-command'
import { ContainerDrivers } from '../job-managers/job-manager'
import { nextAvailablePort } from '../functions/cli-functions'

export abstract class ServerCommand extends NewJobCommand
{
  defaultPort(drivers: ContainerDrivers, server_port_flag: string, expose: boolean)
  {
    const default_address = (expose) ? '0.0.0.0' : '127.0.0.1'
    const port = this.parsePortFlag([server_port_flag]).pop()
    if(port !== undefined && port.address)
      return port
    if(port !== undefined) {
      port.address = default_address
      return port
    }
    const default_port = nextAvailablePort(drivers, 7001)
    return {"hostPort": default_port, "containerPort": default_port, "address": default_address}
  }
}
