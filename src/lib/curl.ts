// =============================================================================
// Curl: A class for executing sync curl requests
//  -- Functions ---------------------------------------------------------------
//  curl - generic wrapper for curl (supports only limited flags)
//  request - simplified calling function
//  -- Example -----------------------------------------------------------------
//  curl.request('POST', {
//    url: "example/endpoint"
//    encoding: "json"
//    data: {a: 1, b: 2}
//  })
// =============================================================================

import * as querystring from 'querystring'
import {ShellCommand} from './shell-command'

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
  curl(options: CurlOptions, post_process="")
  {
    const command = 'curl'
    const args = [options['url']]
    const flags:Dictionary = {}
    if(options['unix-socket'])
      flags['unix-socket'] = {value: options['unix-socket'], noequals: true}
    if(options['header'])
      flags['H'] = options['header']
    if(options['data'])
      flags['d'] = {value: options['data'], noequals: true}
    if(options['method'])
      flags['X'] = {value: options['method'], noequals: true}
    return this.shell.output(command, flags, args, {}, post_process)
  }

  // Shorthand for url or JSON Post Rest
  request(method:method_types, options: {"encoding": "json"|"url", "url": string, "unix-socket"?: string, "data"?: any}, post_process="")
  {
    if(options.encoding == "json") // -- json request --------------------------
      return this.curl({
        "url": `${this.base_url}${options['url']}`,
        "unix-socket": options?.["unix-socket"] || "",
        "header": 'Content-Type: application/json',
        "method": method,
        "data": JSON.stringify(options['data'])
      },
      post_process || this.default_post_process)
    else if(options.encoding == "url") // -- url request ------------------------
      return this.curl({
        "url": `${this.base_url}${options['url']}`,
        "unix-socket": options?.["unix-socket"] || "",
        "method": method,
        "data": querystring.stringify(options['data'])
      },
      post_process || this.default_post_process)
  }

}
