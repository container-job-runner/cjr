
import chalk = require('chalk')
import path = require('path')
import fs = require('fs-extra')
import constants = require('../../constants')

import { ValidatedOutput } from "../../validated-output"
import { StackConfiguration } from "../../config/stacks/abstract/stack-configuration"
import { ShellCommand } from "../../shell-command"
import { BuildDriver } from '../abstract/build-driver'
import { DockerStackConfiguration, DockerRegistryAuthConfig } from '../../config/stacks/docker/docker-stack-configuration'
import { Dictionary, cli_name } from '../../constants'
import { RequestOutput, Curl } from '../../curl'
import { FileTools } from '../../fileio/file-tools'
import { JSTools } from '../../js-tools'

export class DockerSocketBuildDriver extends BuildDriver
{
  protected socket: string // path to socket
  protected build_dir: string // path to tmp directory for saving tar files
  protected curl: Curl
  protected curlPostProcessor = DockerAPIPostProcessor
  protected base_url = "http://v1.24" // base url for api

  protected ERRORSTRINGS = {
    "INVALID_CONFIGURATION": chalk`{bold Invalid Configuration} - This build driver requires a DockerStackConfiguration.`,
    "INVALID_STACK_TYPE": chalk`{bold Invalid Configuration} - StackConfiguration is of unkown type.`,
    "FAILED_TO_EXTRACT_IMAGE_ID": (file:string) => chalk`{bold Failed to Load tar} - could not extract image id for ${file}.`,
    "FAILED_TO_PULL": (image: string) => chalk`{bold Image Pull Failed} - could not pull ${image}.`,
    "FAILED_TO_PUSH": (image: string) => chalk`{bold Image Push Failed} - could not push ${image}.`,
    "FAILED_TO_BUILD": (stack: string) => chalk`{bold Image Build Failed} - stack configuration ${stack} likely contains errors.`,
    "FAILED_TO_LOAD": (file:string) => chalk`{bold Image Load Failed} - failed to load ${file}.`,
    "FAILED_TO_DELETE": (id:string) => chalk`{bold Image Remove Failed} - could not remove image ${id}.`,
    "FAILED_TO_LISTIMAGES": chalk`{bold Image List Failed} - could not get list of current images.`,
    "FAILED_TO_TAG": (id:string) => chalk`{bold Image Tag Failed} - could not tag image ${id}.`,
    "FAILED_IMAGE_SAVE": chalk`{bold Image Save Failed} - unable to write image file.`,
    "FAILED_IMAGE_SAVE_FORMAT": (path:string) => chalk`{bold Image Save Failed} - path must end in ${path}.`
  }

  constructor(shell: ShellCommand, options: {"socket": string, "build-directory": string})
  {
    super(shell)
    this.socket = options["socket"]
    this.build_dir = options["build-directory"]
    this.curl = new Curl(shell, {
      "unix-socket": options["socket"],
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
      constants.subdirectories.stack.build,
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
    const pull_result = this.API_PullImage(configuration)
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
    const mkdir = FileTools.mktempDir(this.build_dir, this.shell)
    if(!mkdir.success) return result.absorb(mkdir)
    const tmp_dir = mkdir.value
    // -- 2. tar contents of stack build folder into build.tar.gz ---------------
    const build_path = path.join(configuration.stack_path, configuration.build_context)
    const archive_name = path.join(tmp_dir, 'build.tar.gz')
    const tar = this.shell.exec(
      `cd ${ShellCommand.bashEscape(build_path)} ; tar`, 
      {'czf': {shorthand: true}},
      [archive_name, "."], // tar build directory into TMPFolder/build.tar.gz
    )
    if(!tar.success) {
      fs.removeSync(tmp_dir)
      return result.absorb(tar)
    }
    // -- 3. call api to build Archive ------------------------------------------
    const build_result = this.API_Build(
        configuration,
        {
            "archive": archive_name,
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
    const registry_auth = this.API_authHeader({
        "username": options.username,
        "token": options.password || options.token || "",
        "server" : options.server
    })

    // -- submit pull request --------------------------------------------------
    const pull_result = this.curlPostProcessor(
      this.curl.post({
        "url": `/images/${configuration.getImage()}/push`,
        "params": {},
        "header": [`X-Registry-Auth: ${registry_auth}`]
      })
    )
    if(!this.validJSONAPIResponse(pull_result, 200))
      pull_result.pushError(this.ERRORSTRINGS.FAILED_TO_PUSH(configuration.getImage()))

    return new ValidatedOutput(true, undefined).absorb(pull_result)
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

  saveImage(configuration: DockerStackConfiguration, options: {path: string, compress: boolean}, stdio: "inherit"|"pipe") : ValidatedOutput<undefined>
  {
    return this.API_saveImage(configuration.getImage(), options.path, options.compress)
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
    if(JSTools.isObject(body) && (typeof body.stream === "string")) // special case for single stream {stream: "value"}
        return [body.stream]
    if(!JSTools.isArray(body)) // otherwise assume [ {stream: value}, ..., {stream: value} ]
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

  protected API_Build(configuration: DockerStackConfiguration, options: {archive: string, encoding: "tar"|"gzip", pull?: boolean, nocache?: boolean}) : ValidatedOutput<{output: string}>
  {
    const result = new ValidatedOutput(true, {output: ""})
    const build_auth = configuration.getBuildAuth();
    const build_result = this.curlPostProcessor(
      this.curl.post({
        "url": `/build`,
        "encoding": options.encoding,
        "params": JSTools.rRemoveEmpty({
          "buildargs": JSON.stringify(configuration.getBuildArgs() || {}),
          "labels" : JSON.stringify({"builder": cli_name}),
          "nocache": options?.nocache || false,
          "pull": options?.pull || false,
          "t": configuration.getImage()       
        }),
        "file": options.archive,
        "header": (build_auth) ? [`X-Registry-Config: ${this.API_buildAuthHeader(build_auth)}`] : undefined
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
    return load_output.match(/(?<=sha256:)[a-zA-z0-9]+/)?.pop() || load_output.match(/(?<=Loaded\simage:\s)[a-zA-Z0-9\-\.\:\_]+/)?.pop() || "";
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

  protected API_PullImage(configuration: DockerStackConfiguration) : ValidatedOutput<{output: string}>
  {
    const image_reference = configuration.getImage()
    const build_auth = configuration.getBuildAuth();
    
    const result = new ValidatedOutput(true, {output: ""})
    const pull_result = this.curlPostProcessor(
      this.curl.post({
        "url": "/images/create",
        "params": {
          "fromImage": image_reference
        },
        "header": (build_auth) ? [`X-Registry-Auth: ${this.API_authHeader(build_auth)}`] : undefined
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

  protected API_saveImage(image: string, save_path: string, compress: boolean): ValidatedOutput<undefined>
  {
    // Note: curl class currently does not allow for output flag --output (due to headers)
    // and therefore we cannot pipe output to file or to gz. For now this command was manually implemented using shell.
    // Comment: The following solutions suggest alterative ways to re-implement the curl class by separating headers and outputs.
    // 1. pipe output to file and headers to sdc out. For example:
    //    curl -sw '%{http_code}' --unix-socket /var/run/docker.sock -X GET http://localhost/v1.40/images/7ea1116658fc/get -o test.tar
    //    This is the solution used below. By writing output to file things will be slower but we also eliminate the possibility of filling
    //    the node buffer for large outputs. However it will be slower and will require cjr to delete the temp files. 
    //    For related interesting comment see: https://superuser.com/a/862395
    // 2. Write the headers to a file using the -D flag, and read the headers while pushing output to stdout. See: 
    //      https://stackoverflow.com/questions/11836238/using-curl-to-download-file-and-view-headers-and-status-code

    const result = new ValidatedOutput(true, undefined)

    // check save_path is valid
    if(compress && !/tar.gz$/.test(save_path))
        return result.pushError(this.ERRORSTRINGS.FAILED_IMAGE_SAVE_FORMAT('.tar.gz'))
    if(!compress && !/.tar$/.test(save_path))
        return result.pushError(this.ERRORSTRINGS.FAILED_IMAGE_SAVE_FORMAT('.tar'))

    const tar_path = save_path.replace(/.gz$/, '')
    const save_request = this.shell.output(
        'curl', 
        {
            s: {},
            w: {value: '%{http_code}', noequals: true},
            "unix-socket": {value: this.socket, noequals: true},
            output: {value: tar_path, noequals: true},
            X: {value: "GET", noequals: true}
        },
        [`${this.base_url}/images/${encodeURI(image)}/get`]
    )
    if(!save_request.success)
        return result.absorb(save_request)
    
    const exit_code = parseInt(save_request.value)
    if(exit_code != 200)
        return result.pushError(this.ERRORSTRINGS.FAILED_IMAGE_SAVE)

    if(compress) 
    {
        const gzip_request = this.shell.output(
            'gzip',
            {},
            [tar_path]
        )
        if(!gzip_request.success)
            return result.pushError(this.ERRORSTRINGS.FAILED_IMAGE_SAVE)
    }

    return result
  }

  // auth header used by push and pull endpoint
  protected API_authHeader(auth: DockerRegistryAuthConfig) : string
  {
    // -- create auth string (must be encoded in base64) -----------------------
    const auth_string = JSON.stringify({
      "username": auth.username,
      "password": auth.token,
      "serveraddress": auth.server
    })
    const buff = Buffer.from(auth_string)
    const auth_str = buff.toString('base64')
    return auth_str
  }

  // auth header used by build endpoint (https://docs.docker.com/engine/api/v1.41/#operation/ImageBuild)
  protected API_buildAuthHeader(auth: DockerRegistryAuthConfig) : string
  {
    // -- create auth string (must be encoded in base64) -----------------------
    const auth_string = JSON.stringify({
      [ auth.server ] : {
        "username": auth.username,
        "password": auth.token
      }
    })
    const buff = Buffer.from(auth_string)
    const auth_str = buff.toString('base64')
    return auth_str
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
