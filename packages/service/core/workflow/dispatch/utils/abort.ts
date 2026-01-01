import type { NextApiResponse } from 'next';

export class WorkflowAbortedError extends Error {
  constructor(message = 'Workflow aborted') {
    super(message);
    this.name = 'WorkflowAbortedError';
  }
}

export const shouldAbort = (params: { abortSignal?: AbortSignal; res?: NextApiResponse }) => {
  return Boolean(params.abortSignal?.aborted || params.res?.closed);
};

export const throwIfAborted = (params: { abortSignal?: AbortSignal; res?: NextApiResponse }) => {
  if (!shouldAbort(params)) return;
  const reason = params.abortSignal?.reason;
  const msg =
    typeof reason === 'string' && reason.trim()
      ? `Workflow aborted: ${reason}`
      : 'Workflow aborted';
  throw new WorkflowAbortedError(msg);
};
