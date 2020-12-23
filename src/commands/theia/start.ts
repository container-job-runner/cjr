import { flags } from '@oclif/command'
import { printValidatedOutput, waitUntilSuccess, urlEnvironmentObject } from '../../lib/functions/misc-functions'
import { initX11 } from '../../lib/functions/cli-functions'
import { ServerCommand } from '../../lib/commands/server-command'
import { RemoteSshJobManager } from '../../lib/job-managers/remote/remote-ssh-job-manager'
import { TheiaService } from '../../lib/services/theia-service'
import { ValidatedOutput } from '../../lib/validated-output'
import { ShellCommand } from '../../lib/shell-command'
import { NoticeStrings } from '../../lib/error-strings'
import { URL } from 'url'
import { accessSync } from 'fs-extra'

export default class Start extends ServerCommand {
  static description = 'Start a Theia server.'
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

    // -- validate project root ------------------------------------------------
    const pr_check = this.validProjectRoot(flags['project-root'])
    if(!pr_check.success)
        return printValidatedOutput(pr_check)

    // -- create stack for running theia ---------------------------------------
    const create_stack = this.createStack(flags)
    if(!create_stack.success)
        return printValidatedOutput(create_stack)
    const {stack_configuration, job_manager } = create_stack.value
    stack_configuration.setRsyncUploadSettings({include: undefined, exclude: undefined})
    stack_configuration.setRsyncDownloadSettings({include: undefined, exclude: undefined})
    if(flags['override-entrypoint']) stack_configuration.setEntrypoint(['/bin/bash', '-c'])
    
    // -- check x11 user settings --------------------------------------------
    if(flags['x11']) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })
    // -- select port --------------------------------------------------------
    const theia_port = this.defaultPort(job_manager.container_drivers, flags["server-port"], flags["expose"], 8009)
    // -- start theia ----------------------------------------------------------
    const theia_service = new TheiaService(job_manager)
    const start_request = theia_service.start(
        { "project-root": flags["project-root"] },
        {
            "stack_configuration": stack_configuration,
            "project-root": flags["project-root"],
            "reuse-image" : this.extractReuseImage(flags),
            "access-port": theia_port,
            "access-ip": this.getAccessIp(job_manager, {"resource": flags["resource"], "expose": flags['expose']}),
            "x11": flags['x11']
        }
    )

    if( ! start_request.success ) 
        return printValidatedOutput(start_request)
    
    // notify user if theia was already running
    if( ! start_request.value.isnew )
    {
        printValidatedOutput(
            new ValidatedOutput(true, undefined)
            .pushNotice(NoticeStrings.THEIA.RUNNING(
                start_request.value.id, 
                start_request.value["project-root"] || ""
            ))
        )
    }
    else // wait for new server to start
    {
        const timeout = Math.floor(parseFloat(this.settings.get('timeout-theia')))
        if(!isNaN(timeout) && timeout > 0) theia_service.READY_CONFIG.command = ['sleep', `${timeout}`]        
        await waitUntilSuccess(
            () => theia_service.ready({"project-root": flags["project-root"]}),
            3000,
            5
        )
    }

    if(!start_request.value["access-port"]) // exit if port not set (this should never occur)
        return

    // -- start tunnel ---------------------------------------------------------
    if( (job_manager instanceof RemoteSshJobManager) && !flags['expose'] ) 
        this.startTunnel(job_manager, {
            "port": start_request.value["access-port"], 
        })

    // -- execute on start commend ---------------------------------------------
    const access_url = `http://${start_request.value["access-ip"]}:${start_request.value["access-port"]}`
    const onstart_cmd = this.settings.get('on-http-start');
    if(flags['quiet']) // exit silently
        return
    else if(onstart_cmd) // launch custom command
    {
        const exec = new ShellCommand(flags['explicit'], flags['quiet'])
            .execAsync(onstart_cmd, {}, [], {
                detached: true,
                stdio: 'ignore',
                env: urlEnvironmentObject(access_url, { SERVER: "theia" })
            })
        if(exec.success) exec.value.unref()
        printValidatedOutput(exec)
    }  
    else // print server url
        console.log(access_url)
  }
  
}
