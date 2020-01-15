export class ValidatedOutput
{
    success: boolean
    data: object
    error: array<string>
    warning: array<string>

    constructor(success: boolean, data: object = null, error: array<string> = [], warning: array<string> = [])
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
