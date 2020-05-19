
import chalk = require('chalk')
import path = require('path')
import fs = require('fs-extra')

import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { BuildDriver } from '../abstract/build-driver'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'
import { Dictionary, cli_name } from '../../constants'
import { RequestOutput, Curl } from '../../curl'
import { FileTools } from '../../fileio/file-tools'
import { JSTools } from '../../js-tools'

export class DockerSocketBuildDriver extends BuildDriver
{
  protected socket: string // path to socket
  protected tmpdir: string // path to tmp directory for saving tar files
  protected curl: Curl

  protected ERRORSTRINGS = {
    "INVALID_CONFIGURATION": chalk`{bold Invalid Configuration} - This build driver requires a DockerStackConfiguration.`,
    "INVALID_STACK_TYPE": chalk`{bold Invalid Configuration} - StackConfiguration is of unkown type.`,
    "FAILED_TO_EXTRACT_IMAGE_ID": (file:string) => chalk`{bold Failed to Load tar} - could not extract image id for ${file}.`,
    "FAILED_TO_PULL": (image: string) => chalk`{bold Image Pull Failed} - could not pull ${image}.`,
    "FAILED_TO_BUILD": (stack: string) => chalk`{bold Image Build Failed} - stack configuration ${stack} likely contains errors.`,
    "FAILED_TO_LOAD": (file:string) => chalk`{bold Image Load Failed} - failed to load ${file}.`,
    "FAILED_TO_DELETE": (id:string) => chalk`{bold Image Remove Failed} - could not remove image ${id}.`,
    "FAILED_TO_LISTIMAGES": chalk`{bold Image List Failed} - could not get list of current images.`
  }

  constructor(shell: ShellCommand, options: {socket: string, tmpdir: string})
  {
    super(shell)
    this.socket = options.socket
    this.tmpdir = options.tmpdir
    this.curl = new Curl(shell, {
      "unix-socket": options.socket,
      "base-url": "http://v1.24"
    })
  }

  isBuilt(configuration: StackConfiguration<any>): boolean
  {
    // -- make api request -----------------------------------------------------
    const api_result = this.curl.get({
      "url": "/images/json",
      "params": {
        "filters": JSON.stringify({
          "reference": [configuration.getImage()]
        })
      }
    });

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_result, 200))
      return false

    // -- return true if -------------------------------------------------------
    if(api_result.value.body?.length > 0)
      return true
    return false
  }

  build(configuration:StackConfiguration<any>, stdio:"inherit"|"pipe", options?: Dictionary) : ValidatedOutput<string>
  {
    const result = new ValidatedOutput(true, "")

    // -- exit if configuration is not a DockerStackConfiguration
    if(!(configuration instanceof DockerStackConfiguration))
      return result.pushError(this.ERRORSTRINGS.INVALID_CONFIGURATION)

    switch (configuration.stack_type)
    {
      case 'dockerfile': // -- build docker file -----------------------------
        result.merge(
          this.buildFromDockerfile(configuration, options)
        )
        break;
      case 'tar': // -- load image.tar or image.tar.gz -----------------------
      case 'tar.gz': // -- build image.tar.gz --------------------------------
        result.merge(
          this.loadArchivedImage(configuration, options)
        )
        break;
      case 'config':  // -- pull remote image --------------------------------
      case 'remote-image':
        result.absorb(
          this.pullImage(configuration, options)
        )
        break;
      default:
        return result.pushError(this.ERRORSTRINGS.INVALID_STACK_TYPE)
    }

    if(stdio == "inherit")
      console.log(result.value)

    return result
  }

  protected loadArchivedImage(configuration: DockerStackConfiguration, options?: Dictionary) : ValidatedOutput<string>
  {
    // -- exit with failure if stack is not of correct type
    const result = new ValidatedOutput(true, "")
    if(!configuration.stack_path)
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(""))
    if(!['tar', 'tar.gz'].includes(configuration.stack_type as string))
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(configuration.stack_path))

    // only extract tar if image does not exist, or if no-cache is specified
    if(this.isBuilt(configuration) && !(configuration?.config?.build?.["no-cache"] || options?.['no-cache']))
      return result

    // -- make api request -----------------------------------------------------
    const archive = path.join(configuration.stack_path, `${configuration.archive_filename}.${configuration.stack_type}`)
    const encoding = (configuration.stack_type == 'tar.gz') ? 'gzip' : 'tar'
    const api_load_result = this.curl.post({
      "url": "/images/load",
      "encoding": encoding,
      "params": {},
      "file": archive
    });
    result.value = this.chunkedJsonStreamStr(api_load_result.value.body)

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_load_result, 200))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_LOAD(archive))

    // -- extract id -----------------------------------------------------------
    const id:string = this.filterStreamData(api_load_result.value.body).pop()?.stream?.match(/(?<=sha256:)[a-zA-z0-9]+/)?.pop() || ""
    if(!id) return result.pushError(this.ERRORSTRINGS.FAILED_TO_EXTRACT_IMAGE_ID(archive));

    // -- retag image ----------------------------------------------------------
    const [repo, tag] = configuration.getImage().split(":")
    const api_tag_result = this.curl.post({
      "url": `/images/${id}/tag`,
      "encoding": "json",
      "params": {
        "repo": repo,
        "tag": tag
      }
    });

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(api_tag_result, 201))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_LOAD(archive))

    return result
  }

  protected pullImage(configuration: DockerStackConfiguration, options?: Dictionary) : ValidatedOutput<string>
  {
    // -- exit with failure if stack is not of correct type --------------------
    const result = new ValidatedOutput(true, "")
    if(!['remote-image', 'config'].includes(configuration.stack_type as string))
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(configuration.stack_path || configuration.getImage()))
    if(!configuration.getImage())
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(configuration.stack_path || ""))

    // -- only pull image if image does not exist, or if pull is specified
    if(this.isBuilt(configuration) && !(configuration?.config?.build?.["pull"] || options?.['pull']))
      return result

    // -- make api request -----------------------------------------------------
    const pull_result = this.curl.post({
      "url": "/images/create",
      "params": {
        "fromImage": configuration.getImage()
      }
    });

    result.value = this.chunkedJsonStreamStr(pull_result.value.body)
    result.absorb(pull_result)
    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(pull_result, 200))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_PULL(configuration.getImage()))
    return result

  }

  protected buildFromDockerfile(configuration: DockerStackConfiguration, options?: Dictionary) : ValidatedOutput<string>
  {
    // -- exit with failure if stack is not of correct type
    const result = new ValidatedOutput(true, "")
    if(!configuration.stack_path)
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(""))
    if(configuration.stack_type !== 'dockerfile')
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(configuration.stack_path))

    // -- 1. make temporary directory ----------------------------------------------
    const mkdir = FileTools.mktempDir(this.tmpdir, this.shell)
    if(!mkdir.success) return result.absorb(mkdir)
    const tmp_dir = mkdir.value
    // -- 2. tar contents of stack build folder into build.tar.gz ------------------
    const build_path = path.join(configuration.stack_path, configuration.build_context)
    const archive_name = path.join(tmp_dir, 'build.tar.gz')
    const tar = this.shell.exec(
      'tar',
      {'czf': {shorthand: true}},
      [archive_name, "."], // tar build directory into TMPFolder/build.tar.gz
      {cwd: build_path} // run tar from within stack folder
    )
    if(!tar.success) {
      fs.removeSync(tmp_dir)
      return result.absorb(tar)
    }
    // -- 3. call api to build Archive ---------------------------------------------
    const build_result = this.buildArchive({
      "archive": archive_name,
      "imageName": configuration.getImage(),
      "buildargs": configuration.getBuildArgs(),
      "encoding": 'gzip',
      "pull": options?.pull || false,
      "nocache": options?.nocache || false
    })
    result.value = this.chunkedJsonStreamStr(build_result.value.body)
    result.absorb(build_result)
    // -- 4. remove tmp folder -----------------------------------------------------
    fs.removeSync(tmp_dir)
    return result
  }

  protected buildArchive(options: {archive: string, imageName?: string, encoding: "tar"|"gzip", buildargs?: {[key: string] : string}, pull?: boolean, nocache?: boolean}) : ValidatedOutput<RequestOutput>
  {
    const build_result = this.curl.post({
      "url": `/build`,
      "encoding": options.encoding,
      "params": JSTools.rRemoveEmpty({
        "buildargs": JSON.stringify(options?.buildargs || {}),
        "labels" : JSON.stringify({"builder": cli_name}),
        "nocache": options?.nocache || false,
        "pull": options?.pull || false,
        "t": options.imageName
      }),
      "file": options.archive
    });

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(build_result, 200))
      build_result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(options.archive))

    return build_result
  }

  removeImage(configuration: DockerStackConfiguration): ValidatedOutput<undefined>
  {
    return this.rmi(configuration.getImage())
  }

  removeAllImages(stack_path: string): ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)

    // -- make api request -----------------------------------------------------
    const api_list = this.curl.get({
      "url": `/images/json`,
      "params": {
        "filters": JSON.stringify({"label": [`builder=${cli_name}`, `stack=${stack_path}`]})
      }
    });

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_list, 200))
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_LISTIMAGES)

    const image_ids = api_list.value.body
      ?.map((o:any):string => (typeof o?.Id == "string") ? o?.Id : "")
      ?.filter((s:string) => s != "") || []

    image_ids.map((id:string) => {
      result.absorb(this.rmi(id))
    })

    return result
  }

  private rmi(id: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)

    // -- make api request -----------------------------------------------------
    const api_result = this.curl.delete({
      "url": `/images/${id}`,
      "params": {}
    });

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_result, 200))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_DELETE(id))

    return result
  }

  private filterStreamData(body: any) : Array<{stream: string}>
  {
    if(!JSTools.isArray(body))
      return []
    const stream: Array<{stream: string}> = []
    body?.map( (a:any) => {
      if(typeof a?.stream === "string")
        stream.push({"stream" : a.stream})
    })
    return stream
  }

  private chunkedJsonStreamStr(body: any) : string
  {
    return this.filterStreamData(body).map((o: {stream: string}) => o.stream).join("")
  }

  private validAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!response.success) return false
    if(code !== undefined && response.value.header.code !== code) return false
    return true
  }

  private validJSONAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!this.validAPIResponse(response, code)) return false
    if(response.value.header.type !== "application/json") return false
    return true
  }

}
