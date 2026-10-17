/**
 * The domain throws plain errors carrying a machine-readable `code`.
 *
 * Part 7 is about what happens at the boundary: the same four codes, turned
 * into something a customer, a call-centre agent and an on-call engineer can
 * each act on without reading this file.
 */

export type BankErrorCode =
  | 'CARD_NOT_RECOGNISED'
  | 'PIN_INCORRECT'
  | 'CARD_RETAINED'
  | 'INSUFFICIENT_FUNDS'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'LEDGER_UNAVAILABLE';

export class BankError extends Error {
  readonly code: BankErrorCode;
  readonly detail: Record<string, string | number>;

  constructor(
    code: BankErrorCode,
    message: string,
    detail: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = 'BankError';
    this.code = code;
    this.detail = detail;
  }
}

export const isBankError = (error: unknown): error is BankError =>
  error instanceof BankError;
