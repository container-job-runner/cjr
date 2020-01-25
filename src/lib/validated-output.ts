export class ValidatedOutput
{
    success: boolean
    data: any
    error: Array<string>
    warning: Array<string>

    constructor(success: boolean, data: any = [], error: Array<string> = [], warning: Array<string> = [])
    {
      this.success = success;
      this.data = data;
      this.error = error;
      this.warning = warning;
    }

    pushError(message: string)
    {
      this.error.push(message)
      this.success = false;
    }

    pushWarning(message: string)
    {
      this.warning.push(message)
    }
}
