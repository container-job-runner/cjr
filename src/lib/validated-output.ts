export class ValidatedOutput<T>
{
    success: boolean
    data: T
    error: Array<string>
    warning: Array<string>

    constructor(success: boolean, data: T, error: Array<string> = [], warning: Array<string> = [])
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
      return this
    }

    pushWarning(message: string)
    {
      this.warning.push(message)
      return this
    }

    absorb(vo:ValidatedOutput<any>)
    {
      this.success = this.success && vo.success
      this.error.push(...vo.error)
      this.warning.push(...vo.warning)
      return this
    }
}
