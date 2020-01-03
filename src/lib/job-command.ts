// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import {JSONFile} from './fileio/json-file'
import {StackCommand} from './stack-command'

export abstract class JobCommand extends StackCommand
{
  private const job_json = new JSONFile(
    path.join(this.config.configDir, "jobs"))

}
