import { flags } from '@oclif/command'
import { printValidatedOutput, urlEnvironmentObject } from '../../lib/functions/misc-functions'
import { initX11 } from '../../lib/functions/cli-functions'
import { ServiceCommand } from '../../lib/commands/service-command'
import { TheiaService } from '../../lib/services/theia-service'
import { ValidatedOutput } from '../../lib/validated-output'
import { JobManager } from '../../lib/job-managers/abstract/job-manager'
import { ServiceInfo } from '../../lib/services/abstract/abstract-service'

export default class Start extends ServiceCommand {
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
    this.augmentFlagsForServiceStart(flags, args)

    // -- check x11 user settings ---------------------------------------------
    if( flags['x11'] ) await initX11({
            'interactive': this.settings.get('interactive'),
            'xquartz': this.settings.get('xquartz-autostart'),
            'explicit': flags.explicit
        })

    // -- service generator --------------------------------------------------
    const serviceGenerator = (job_manager : JobManager) => {
        return new TheiaService( job_manager, {
            "start-timeout": Math.max(0, parseFloat(this.settings.get('timeout-theia'))) || undefined
        })
    }

    const failure_value = { 
        "start" : new ValidatedOutput<ServiceInfo>( false, { id: "", isnew: true , "service-ports": {}} ), 
        "ready" : new ValidatedOutput( false, { output: "" } )
    }
        
    const result = await this.startService(serviceGenerator, flags, { 
            "default-access-port": 8009,
            "wait-config": {"timeout": 0, "max-tries": 1}
        },
        failure_value
    )

    printValidatedOutput(result) // print any warnings
    if(!result.success) return

    // -- execute on start commend ---------------------------------------------
    const start_result = result.value.start    
    const access_url = `http://${start_result.value["access-ip"]}:${start_result.value["access-port"]}`
    this.serviceOnReady(flags, {
        "exec": {
            "command": this.settings.get('on-http-start'),
            "environment": urlEnvironmentObject( access_url, { SERVER: "theia" } )
        },
        "access-url": access_url
    }) 
  } 
}
