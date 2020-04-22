import * as url from 'url'
import { Curl } from '../lib/curl';
import { ShellCommand } from '../lib/shell-command';
import { StackCommand } from '../lib/commands/stack-command';
import { DockerSocketRunDriver } from '../lib/drivers/docker/docker-socket-run-driver'

export default class Test extends StackCommand {
  static description = 'Initialize a project in the current directory.'
  static args = []
  static flags = {}
  static strict = false;

  async run()
  {
    const shell = new ShellCommand(true, false)

    const run_cmd = this.settings.get('run-cmd');
    const tag:string = this.settings.get('image-tag')
    const selinux:boolean = this.settings.get('selinux')
    const socket:string = this.settings.get('socket-path')

    const driver = new DockerSocketRunDriver(shell, {tag: tag, selinux: selinux, socket: socket});
    console.log(driver.jobInfo([]))



    // const curl = new Curl(shell, {
    //   "base-url": "http://v1.24",
    //   "post-process": "json"
    // })

    // // list current images
    // var result = curl.get({
    //   "url": "/images/json",
    //   "unix-socket": socket,
    //   "encoding": "url"
    // })
    // console.log(result)

    // // build image
    // var result = curl.request('GET', {
    //   "url": "/build",
    //   "unix-socket": socket,
    //   "encoding": "json",
    //   "data": {
    //     remote: ""
    //   }
    // })
    // console.log(result)

    // NODE TAR: https://www.npmjs.com/package/tar-fs
    // DOCKERODE: https://github.com/apocas/dockerode/blob/master/lib/docker.js
    // SET FILES (INCLUDING TAR over CURL): https://stackoverflow.com/questions/15912924/how-to-send-file-contents-as-body-entity-using-curl

  }

}
