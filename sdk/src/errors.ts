export class ArmatureError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ArmatureError';
    this.status = status;
    this.code = code;
  }
}
