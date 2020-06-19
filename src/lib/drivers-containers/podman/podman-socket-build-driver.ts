import chalk = require('chalk')
import { DockerSocketBuildDriver } from '../docker/docker-socket-build-driver'
import { ValidatedOutput } from '../../validated-output'
import { RequestOutput, Curl } from '../../curl'
import { ShellCommand } from '../../shell-command'
import { JSTools } from '../../js-tools'

export class PodmanSocketBuildDriver extends DockerSocketBuildDriver
{
  protected base_url = "http://libpod" // base url for api
  protected curlPostProcessor = PodmanAPIPostProcessor

  constructor(shell: ShellCommand, options: {"socket": string, "build-directory": string})
  {
    super(shell, options)
  }

  protected API_Build(options: {archive: string, imageName?: string, encoding: "tar"|"gzip", buildargs?: {[key: string] : string}, pull?: boolean, nocache?: boolean}) : ValidatedOutput<{output: string}>
  {
    options.encoding = "tar" // as of podman 1.9.2 API returns error if header is set to x-tar.
    return super.API_Build(options)
  }

  protected API_ExtractLoadImageId(load_output: string) : string
  {
    return load_output.match(/(?<=@)[a-zA-z0-9]+/)?.pop() || ""
  }

  protected streamsToString(body: any) : string
  {
    if(JSTools.isString(body?.stream))
      return body.stream
    return ""
  }

  // == NEW ENDPOINT: Not yet functional =======================================
  // protected API_PullImage(image_reference: string) : ValidatedOutput<{output: string}>
  // {
  //   const result = new ValidatedOutput(true, {output: ""})
  //   const pull_result = this.curlPostProcessor(
  //     this.curl.post({
  //       "url": "/images/pull",
  //       "params": {
  //         "reference": image_reference
  //       }
  //     })
  //   )
  //   if(!this.validJSONAPIResponse(pull_result, 200))
  //     pull_result.pushError(this.ERRORSTRINGS.FAILED_TO_PULL(image_reference))

  //   result.value.output = this.streamsToString(pull_result.value.body)
  //   return result
  // }

  // === NEW ENDPOINT: Not yet functional ======================================
  // protected API_RemoveImage(ids: Array<string>) : ValidatedOutput<undefined>
  // {
  //   const result = new ValidatedOutput(true, undefined)

  //   // -- make api request -----------------------------------------------------
  //   ids.map((id:string) => {
  //     const api_result = this.curlPostProcessor(
  //       this.curl.delete({
  //         "url": `/images/remove`,
  //         "encoding": "json",
  //         "body": {
  //           "images": ids
  //         }
  //       })
  //     )
  //     result.absorb(api_result)
  //     if(!this.validJSONAPIResponse(api_result, 200))
  //       result.pushError(this.ERRORSTRINGS.FAILED_TO_DELETE(id))
  //   })

  //   return result
  // }

}

export function PodmanAPIPostProcessor(curl_result: ValidatedOutput<RequestOutput>) : ValidatedOutput<RequestOutput>
{
    const ERRORSTRINGS_INVALID_JSON = chalk`{bold Podman API Returned Invalid JSON}`
    const row_splitter = /(?<!\\)\n/

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
