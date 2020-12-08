import { flags } from '@oclif/command'
import { printValidatedOutput, waitUntilSuccess, urlEnvironmentObject } from '../../lib/functions/misc-functions'
import { ServerCommand } from '../../lib/commands/server-command'
import { RemoteSshJobManager } from '../../lib/job-managers/remote/remote-ssh-job-manager'
import { VNCService } from '../../lib/services/VNCService'
import { ValidatedOutput } from '../../lib/validated-output'
import { NoticeStrings } from '../../lib/error-strings'
import { ShellCommand } from '../../lib/shell-command'

export default class Start extends ServerCommand {
  static description = 'Start a VNC server.'
  static args = [ { name: "project-root" } ]
  static flags = {
    "resource": flags.string({env: 'CJR_RESOURCE'}),
    "project-root": flags.string({env: 'CJR_PROJECTROOT'}),
    "here": flags.boolean({default: false, char: 'h', exclusive: ['project-root'], description: 'sets project-root to current working directory'}),
    "stack": flags.string({env: 'CJR_STACK'}),
    "profile": flags.string({multiple: true, description: "set stack profile"}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "config-files": flags.string({default: [], multiple: true, description: "additional configuration file to override stack configuration"}),
    "x11": flags.boolean({default: false}),
    "port": flags.string({default: [], multiple: true}),
    "label": flags.string({default: [], multiple: true, description: "additional labels to append to job"}),
    "server-port": flags.string({default: "auto", description: "default port for the jupyter server"}),
    "expose": flags.boolean({default: false}),
    "verbose": flags.boolean({default: false, char: 'v', description: 'shows output for each stage of the job.', exclusive: ['quiet']}),
    "quiet": flags.boolean({default: false, char: 'q'}),
    "explicit": flags.boolean({default: false}),
    "no-autoload": flags.boolean({default: false, description: "prevents cli from automatically loading flags using project settings files"}),
    "build-mode":  flags.string({default: "reuse-image", description: 'specify how to build stack. Options include "reuse-image", "cached", "no-cache", "cached,pull", and "no-cache,pull"'}),
    "working-directory": flags.string({default: process.cwd(), description: 'cli will behave as if it was called from the specified directory'}),
    "override-entrypoint": flags.boolean({default: false, description: 'forces container entrypoint to be sh shell. This may be useful for images that where not designed for cjr.'})
  }
  static strict = true;

  async run()
  {
    const { args, flags } = this.parse(Start)
    this.augmentFlagsForJob(flags)
    this.augmentFlagsWithProjectRootArg(args, flags)
    this.overrideResourceFlagForDevCommand(flags)

    // -- create stack for running vnc ---------------------------------------
    const create_stack = this.createStack(flags)
    if(!create_stack.success)
        return printValidatedOutput(create_stack)
    const {stack_configuration, job_manager } = create_stack.value
    if(flags['override-entrypoint']) stack_configuration.setEntrypoint(['/bin/bash', '-c'])
    
    // -- select port --------------------------------------------------------
    const vnc_port = this.defaultPort(job_manager.container_drivers, flags["server-port"], flags["expose"], 9001)
    // -- start vnc ----------------------------------------------------------
    const vnc_service = new VNCService(job_manager, {
        resolution: this.settings.get('vnc-resolution'),
        password: this.settings.get('vnc-password')
    })
    const start_request = vnc_service.start(
        { "project-root": flags["project-root"] },
        {
            "stack_configuration": stack_configuration,
            "project-root": flags["project-root"],
            "reuse-image" : this.extractReuseImage(flags),
            "port": vnc_port,
            "ip": this.getAccessIp(job_manager, {"resource": flags["resource"], "expose": flags['expose']}),
            "x11": flags['x11']
        }
    )

    if( ! start_request.success ) 
        return printValidatedOutput(start_request)
    
    // notify user if vnc was already running
    if( ! start_request.value.isnew )
    {
        printValidatedOutput(
            new ValidatedOutput(true, undefined)
            .pushNotice(NoticeStrings.VNC.RUNNING(
                start_request.value.id, 
                start_request.value["project-root"] || ""
            ))
        )
    }
    else // wait for new server to start
    {
        await waitUntilSuccess(
            () => vnc_service.ready({"project-root": flags["project-root"]}),
            3000,
            5
        )
    }

    // -- start tunnel ---------------------------------------------------------
    if( (job_manager instanceof RemoteSshJobManager) && !flags['expose'] ) 
        this.startTunnel(job_manager, {
            "port": start_request.value.port, 
        })

    // -- execute on start commend ---------------------------------------------
    const access_url = `vnc://${start_request.value.ip}:${start_request.value.port}`
    const onstart_cmd = this.settings.get('on-vnc-start') 
    if(flags['quiet']) // exit silently
        return
    else if(onstart_cmd) // open webapp
        printValidatedOutput(
            new ShellCommand(flags['explicit'], flags['quiet'])
            .execAsync(onstart_cmd, {}, [], {
                env: urlEnvironmentObject(access_url)
            })
        )   
    else // print server url
        console.log(access_url)
  }
}
