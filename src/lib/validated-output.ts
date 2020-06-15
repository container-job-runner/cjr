export class ValidatedOutput<T>
{
    success: boolean
    value: T
    error: Array<string>
    warning: Array<string>
    notice: Array<string>

    constructor(success: boolean, value: T, error: Array<string> = [], warning: Array<string> = [], notice: Array<string> = [])
    {
      this.success = success;
      this.value = value;
      this.error = error;
      this.warning = warning;
      this.notice = notice
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

    pushNotice(message: string)
    {
      this.notice.push(message)
      return this
    }

    absorb( ... args: ValidatedOutput<any>[])
    {
      args.map((vo:ValidatedOutput<any>) => {
        this.success = this.success && vo.success
        this.error.push( ... vo.error)
        this.warning.push( ... vo.warning)
        this.notice.push( ... vo.notice)
      })
      return this
    }

    merge(vo:ValidatedOutput<T>)
    {
      this.absorb(vo)
      this.value = vo.value
      return this
    }
}
