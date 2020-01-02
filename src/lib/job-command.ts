// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import {JSONFileWriter} from './json-file-writer'
import {StackCommand} from './stack-command'

export abstract class JobCommand extends StackCommand
{
  private const job_json = new JSONFileWriter(
    path.join(this.config.configDir, "jobs"))

}
