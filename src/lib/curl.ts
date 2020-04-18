// =============================================================================
// Curl: A class for executing sync curl requests
//  -- Functions ---------------------------------------------------------------
//  curl - generic wrapper for curl (supports only limited flags)
//  post - simplified making POST request
//  get - simplified making GET request
//  -- Example -----------------------------------------------------------------
//  curl.get({
//    url: "example/endpoint"
//    data: {a: 1, b: 2}
//  })
//  curl.post({
//    url: "example/endpoint"
//    encoding: "json"
//    data: {a: 1, b: 2}
//  })
// =============================================================================

import * as url from 'url'
import * as querystring from 'querystring'
import { ShellCommand } from './shell-command'
import { ValidatedOutput } from './validated-output'

// -- types --------------------------------------------------------------------
type method_types = "GET"|"POST"|"DELETE"|"PUT"|"PATCH"
type Dictionary = {[key: string]: any}
type CurlOptions = {
  "url": string,
  "unix-socket"?: string,
  "method"?: method_types,
  "header"?: string,
  "data"?: string|Array<string>
}
type RequestOptions = {
  "encoding": "json"|"url",
  "url": string,
  "unix-socket"?: string,
  "data"?: any
}

export class Curl
{
  private shell:ShellCommand              // executes curl shell command
  private base_url: string                // base url that will be prepended to url provide
  private default_post_process: string    // default post-processing to use for request command

  constructor(shell:ShellCommand, options?: {'base-url'?:string, 'post-process'?: string})
  {
    this.shell = shell;
    this.base_url = options?.['base-url'] || ""
    this.default_post_process = options?.['post-process'] || ""
  }

  // Generic function that wraps curl
  curl(options: CurlOptions, post_process = ""):ValidatedOutput
  {
    const command = 'curl'
    const args = [options['url']]
    const flags:Dictionary = {}

    if(options['unix-socket'])
      flags['unix-socket'] = {value: options['unix-socket'], noequals: true}
    if(options['header'])
      flags['H'] = {value: options['header'], noequals: true}
    if(options['data'])
      flags['d'] = {value: options['data'], noequals: true}
    if(options['method'])
      flags['X'] = {value: options['method'], noequals: true}

      return this.shell.output(command, flags, args, {}, post_process)
  }

  // Shorthand for GET request with url or JSON data
  get(options: RequestOptions, post_process = ""):ValidatedOutput
  {
    const has_data  = options?.['data'] != undefined;
    const dataToStr = (has_data && options['encoding'] == "json") ?
      (s:string) => querystring.stringify({json: JSON.stringify(s)}) :
      querystring.stringify;

    return this.curl(
        {
          "url": `${url.resolve(this.base_url, options['url'])}?${(has_data) ? dataToStr(options['data']) : ""}`,
          "unix-socket": options?.["unix-socket"] || "",
          "header": 'Content-Type: application/x-www-form-urlencoded',
          "method": 'GET'
        },
        post_process || this.default_post_process
      )
  }

  // Shorthand for url or JSON get
  post(options: RequestOptions, post_process = ""):ValidatedOutput
  {
    if(options.encoding == "json") // -- json request --------------------------
      return this.curl(
        this.postCurlOptions(options, 'Content-Type: application/json', JSON.stringify),
        post_process || this.default_post_process
      )
    else if(options.encoding == "url") // -- url request ------------------------
      return this.curl(
        this.postCurlOptions(options, 'Content-Type: application/x-www-form-urlencoded', querystring.stringify),
        post_process || this.default_post_process
      )
    return new ValidatedOutput(false).pushError('Invalid encoding.')
  }

  private postCurlOptions(options: RequestOptions, header: string, dataToStr:(data: any) => string):CurlOptions
  {
    return {
        "url": url.resolve(this.base_url, options['url']),
        "unix-socket": options?.["unix-socket"] || "",
        "header": header,
        "method": 'POST',
        "data": dataToStr(options['data'])
      }
  }

}
