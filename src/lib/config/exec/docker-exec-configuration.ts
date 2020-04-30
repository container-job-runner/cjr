import { ExecConfiguration } from './exec-configuration';
import { Dictionary } from '../../constants';

export class DockerExecConfiguration extends ExecConfiguration
{
  cliExecObject() : Dictionary
  {
    return {
      'wd': this.working_directory,
      'detached': !this.synchronous,
      'interactive': this.interactive
    }
  }

  apiExecObject() : Dictionary
  {
    return {
        "AttachStdin": true,
        "AttachStdout": true,
        "AttachStderr": true,
        "OpenStdin": true,
        "Tty": this.interactive,
        "Cmd": this.command,
        "WorkingDir": this.working_directory,
      }
  }

}
