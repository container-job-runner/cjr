export class ValidatedOutput
{
    success: boolean
    data:  object
    error: array<string>

    constructor(success: boolean, data: object = null, error: array<string> = [])
    {
      this.success = success;
      this.data = data;
      this.error = error;
    }

    pushError(message: string)
    {
      this.error.push(message)
    }
}
