
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
  protected curlPostProcessor = DockerAPIPostProcessor
  protected base_url = "http://v1.24" // base url for api

  protected ERRORSTRINGS = {
    "INVALID_CONFIGURATION": chalk`{bold Invalid Configuration} - This build driver requires a DockerStackConfiguration.`,
    "INVALID_STACK_TYPE": chalk`{bold Invalid Configuration} - StackConfiguration is of unkown type.`,
    "FAILED_TO_EXTRACT_IMAGE_ID": (file:string) => chalk`{bold Failed to Load tar} - could not extract image id for ${file}.`,
    "FAILED_TO_PULL": (image: string) => chalk`{bold Image Pull Failed} - could not pull ${image}.`,
    "FAILED_TO_BUILD": (stack: string) => chalk`{bold Image Build Failed} - stack configuration ${stack} likely contains errors.`,
    "FAILED_TO_LOAD": (file:string) => chalk`{bold Image Load Failed} - failed to load ${file}.`,
    "FAILED_TO_DELETE": (id:string) => chalk`{bold Image Remove Failed} - could not remove image ${id}.`,
    "FAILED_TO_LISTIMAGES": chalk`{bold Image List Failed} - could not get list of current images.`,
    "FAILED_TO_TAG": (id:string) => chalk`{bold Image Tag Failed} - could not tag image ${id}.`
  }

  constructor(shell: ShellCommand, options: {socket: string, tmpdir: string})
  {
    super(shell)
    this.socket = options.socket
    this.tmpdir = options.tmpdir
    this.curl = new Curl(shell, {
      "unix-socket": options.socket,
      "base-url": this.base_url
    })
  }

  isBuilt(configuration: StackConfiguration<any>): boolean
  {
    // -- make api request -----------------------------------------------------
    const result = this.API_ImageListWithReference(configuration.getImage())
    if(result.success && result.value.length > 0)
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
    // -- exit with failure if stack is not of correct type --------------------
    const result = new ValidatedOutput(true, "")
    if(!configuration.stack_path)
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(""))
    if(!['tar', 'tar.gz'].includes(configuration.stack_type as string))
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(configuration.stack_path))

    // -- only extract tar if image does not exist, or if no-cache is true -----
    if(this.isBuilt(configuration) && !(configuration?.config?.build?.["no-cache"] || options?.['no-cache']))
      return result

    // -- make api request -----------------------------------------------------
    const archive = path.join(
      configuration.stack_path,
      `${configuration.archive_filename}.${configuration.stack_type}`
    )
    const encoding = (configuration.stack_type == 'tar.gz') ? 'gzip' : 'tar'
    const api_result = this.API_LoadArchive(archive, encoding)
    result.value = api_result.value.output
    if(!api_result.success)
      return result.absorb(api_result)

    // -- retag image ----------------------------------------------------------
    const id = api_result.value.id
    const [ repo, tag ] = configuration.getImage().split(":")
    const api_tag_result = this.API_TagImage(id, repo, tag)

    if(!api_tag_result.success)
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
    const pull_result = this.API_PullImage(configuration.getImage())
    result.value = pull_result.value.output

    result.absorb(pull_result)
    // -- check request status -------------------------------------------------
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

    // -- 1. make temporary directory -------------------------------------------
    const mkdir = FileTools.mktempDir(this.tmpdir, this.shell)
    if(!mkdir.success) return result.absorb(mkdir)
    const tmp_dir = mkdir.value
    // -- 2. tar contents of stack build folder into build.tar.gz ---------------
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
    // -- 3. call api to build Archive ------------------------------------------
    const build_result = this.API_Build({
      "archive": archive_name,
      "imageName": configuration.getImage(),
      "buildargs": configuration.getBuildArgs(),
      "encoding": 'gzip',
      "pull": options?.pull || false,
      "nocache": options?.nocache || false
    })
    result.absorb(build_result)
    result.value = build_result.value.output
    // -- 4. remove tmp folder -------------------------------------------------
    fs.removeSync(tmp_dir)
    return result
  }

  tagImage(configuration: DockerStackConfiguration, name: string)
  {
    const [repo, tag] = name.split(':')
    return this.API_TagImage(configuration.getImage(), repo, tag)
  }

  pushImage(configuration: DockerStackConfiguration, options: Dictionary, stdio: "inherit"|"pipe")
  {
    return new ValidatedOutput(false, undefined)
  }

  removeImage(configuration: DockerStackConfiguration): ValidatedOutput<undefined>
  {
    return this.API_RemoveImage([configuration.getImage()])
  }

  removeAllImages(stack_path: string): ValidatedOutput<undefined>
  {
    // -- make api request -----------------------------------------------------
    const result = new ValidatedOutput(true, undefined)
    const api_list = this.API_ImageListWithStackLabel(stack_path)
    result.absorb(api_list, this.API_RemoveImage(api_list.value))
    return result
  }

  // ===========================================================================
  // API Output Processing functions
  // ===========================================================================

  // turns chucked output tagged with stream into a string
  protected streamsToString(body: Array<{stream: string}>) : string
  {
    return this.extractStreamStrings(body).join("")
  }

  // certain Docker API endpoints returns a json object on each line
  // this function parses objects that contain the field {stream : ""}
  protected extractStreamStrings(body: any) : Array<string>
  {
    if(!JSTools.isArray(body))
      return []
    const stream: Array<string> = []
    body?.map( (a:any) => {
      if(typeof a?.stream === "string")
        stream.push(a.stream)
    })
    return stream
  }

  protected validAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!response.success) return false
    if(code !== undefined && response.value.header.code !== code) return false
    return true
  }

  protected validJSONAPIResponse(response: ValidatedOutput<RequestOutput>, code?:number) : boolean
  {
    if(!this.validAPIResponse(response, code)) return false
    if(response.value.header.type !== "application/json") return false
    return true
  }

  // ===========================================================================
  // Function Wrappers for API calls
  // ===========================================================================

  protected API_Build(options: {archive: string, imageName?: string, encoding: "tar"|"gzip", buildargs?: {[key: string] : string}, pull?: boolean, nocache?: boolean}) : ValidatedOutput<{output: string}>
  {
    const result = new ValidatedOutput(true, {output: ""})
    const build_result = this.curlPostProcessor(
      this.curl.post({
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
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(build_result, 200))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD(options.archive))

    result.value.output = this.streamsToString(build_result.value.body)
    return result
  }

  protected API_LoadArchive(archive: string, encoding: 'tar'|'gzip') : ValidatedOutput<{id: string, output: string}>
  {
    const result = new ValidatedOutput(true, {id: "", output: ""})
    const api_load_result = this.curlPostProcessor(
      this.curl.post({
        "url": "/images/load",
        "encoding": encoding,
        "params": {},
        "file": archive
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_load_result, 200))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_LOAD(archive))

    // -- extract output and id ------------------------------------------------
    const output = this.streamsToString(api_load_result.value.body)
    const id = this.API_ExtractLoadImageId(output)
    if(!id)
      result.pushError(this.ERRORSTRINGS.FAILED_TO_EXTRACT_IMAGE_ID(archive));

    result.value.output = output
    result.value.id = id
    return result
  }

  protected API_ExtractLoadImageId(load_output: string) : string
  {
    return load_output.match(/(?<=sha256:)[a-zA-z0-9]+/)?.pop() || ""
  }

  protected API_TagImage(id: string, repo: string, tag: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    const api_tag_result = this.curlPostProcessor(
      this.curl.post({
        "url": `/images/${id}/tag`,
        "encoding": "json",
        "params": {
          "repo": repo,
          "tag": tag
        }
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validAPIResponse(api_tag_result, 201))
      result.pushError(this.ERRORSTRINGS.FAILED_TO_TAG(id))

    return result

  }

  protected API_PullImage(image_reference: string) : ValidatedOutput<{output: string}>
  {
    const result = new ValidatedOutput(true, {output: ""})
    const pull_result = this.curlPostProcessor(
      this.curl.post({
        "url": "/images/create",
        "params": {
          "fromImage": image_reference
        }
      })
    )
    if(!this.validJSONAPIResponse(pull_result, 200))
      pull_result.pushError(this.ERRORSTRINGS.FAILED_TO_PULL(image_reference))

    result.value.output = this.streamsToString(pull_result.value.body)
    return result
  }

  protected API_RemoveImage(ids: Array<string>) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)

    // -- make api request -----------------------------------------------------
    ids.map((id:string) => {
      const api_result = this.curlPostProcessor(
        this.curl.delete({
          "url": `/images/${id}`,
          "params": {}
        })
      )
      result.absorb(api_result)
      if(!this.validJSONAPIResponse(api_result, 200))
        result.pushError(this.ERRORSTRINGS.FAILED_TO_DELETE(id))
    })

    return result
  }

  protected API_ImageListWithStackLabel(stack_path: string) : ValidatedOutput<string[]>
  {
    const result = new ValidatedOutput(true, [])

    // -- make api request -----------------------------------------------------
    const api_list = this.curlPostProcessor(
      this.curl.get({
        "url": `/images/json`,
        "params": {
          "filters": JSON.stringify({"label": [
            `builder=${cli_name}`,
            `stack=${stack_path}`
          ]})
        }
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_list, 200))
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_LISTIMAGES)

    result.value = api_list.value.body
      ?.map((o:any):string => (typeof o?.Id == "string") ? o?.Id : "")
      ?.filter((s:string) => s != "") || []
    return result

  }

  protected API_ImageListWithReference(reference: string): ValidatedOutput<string[]>
  {
    const result = new ValidatedOutput(true, [])

    // -- make api request -----------------------------------------------------
    const api_result = this.curlPostProcessor(
      this.curl.get({
        "url": "/images/json",
        "params": {
          "filters": JSON.stringify({
            "reference": [reference]
          })
        }
      })
    )

    // -- check request status -------------------------------------------------
    if(!this.validJSONAPIResponse(api_result, 200) || !JSTools.isArray(api_result.value.body))
      return result.pushError(this.ERRORSTRINGS.FAILED_TO_LISTIMAGES)

    // -- return true if -------------------------------------------------------
    result.value = api_result.value.body
    return result
  }

}

export function DockerAPIPostProcessor(curl_result: ValidatedOutput<RequestOutput>) : ValidatedOutput<RequestOutput>
{
    const ERRORSTRINGS_INVALID_JSON = chalk`{bold Docker API Returned Invalid JSON}`
    const row_splitter = /(?:\r\n)+/

    const response = curl_result.value
    const header = response.header

    if(header.type == 'application/json')
    {
      let parsed = false;
      // -- first try to parse body as valid json ------------------------------
      try { response.body = JSON.parse(response.body) ; parsed = true }
      catch(e) { }
      if( parsed ) return curl_result
      // -- next try to parse as line json -------------------------------------
      const rows = response.body.split(row_splitter).filter((s:string) => !/^\s*$/.test(s))
      const body_parsed:Array<any> = []
      try { rows.map( (s:string) => body_parsed.push( JSON.parse(s))) ; response.body = body_parsed; parsed = true }
      catch(e) { }
      if( parsed ) return curl_result
      else curl_result.pushError(ERRORSTRINGS_INVALID_JSON)
    }

    return curl_result
}
