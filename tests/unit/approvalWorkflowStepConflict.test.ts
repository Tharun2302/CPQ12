import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  approvalWorkflowServiceMongoDB,
  isStepAlreadyHandledError,
} from '../../src/services/approvalWorkflowServiceMongoDB';

// Shared-mailbox approvers need a teammate's 409 told apart from a real failure

function mockResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => body),
    json: vi.fn(async () => JSON.parse(body)),
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected updateWorkflowStep to reject');
}

describe('approvalWorkflowServiceMongoDB.updateWorkflowStep — stale action errors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a 409 with the server message, HTTP status and code, reading the body once', async () => {
    const response = mockResponse(409, JSON.stringify({
      success: false,
      code: 'STEP_ALREADY_HANDLED',
      error: 'This document is already approved by the Technical Team.',
      stepRole: 'Technical Team',
      stepStatus: 'approved',
      actedAt: '2026-09-28T09:00:00.000Z',
    }));
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 2, { status: 'approved' }));

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('This document is already approved by the Technical Team.');
    expect(err).toMatchObject({ status: 409, code: 'STEP_ALREADY_HANDLED' });
    expect(isStepAlreadyHandledError(err)).toBe(true);
    expect(response.text).toHaveBeenCalledTimes(1);
    expect(response.json).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/approval-workflows\/wf-1\/step\/2$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ status: 'approved' });
  });

  it.each([
    ['WORKFLOW_CLOSED', 'This document was already denied by the Legal Team.'],
    ['NOT_CURRENT_STEP', 'This document is waiting on the Technical Team first.'],
  ])('treats a 409 %s as already handled and keeps its message', async (code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(409, JSON.stringify({ success: false, code, error: message }))));

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 3, { comments: 'Looks fine' }));

    expect((err as Error).message).toBe(message);
    expect(err).toMatchObject({ status: 409, code });
    expect(isStepAlreadyHandledError(err)).toBe(true);
  });

  it('does not treat a 409 CONFLICT as already handled so the approver can retry', async () => {
    const message = 'Someone else just updated this document. Please refresh and try again.';
    const body = JSON.stringify({ success: false, code: 'CONFLICT', error: message });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(409, body)));

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 2, { status: 'approved' }));

    expect((err as Error).message).toBe(message);
    expect(err).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(isStepAlreadyHandledError(err)).toBe(false);
  });

  it('does not treat a 500 as already handled', async () => {
    const response = mockResponse(500, JSON.stringify({ success: false, error: 'Database not available' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 2, { status: 'approved' }));

    expect((err as Error).message).toBe('Database not available');
    expect(err).toMatchObject({ status: 500, code: undefined });
    expect(isStepAlreadyHandledError(err)).toBe(false);
    expect(response.text).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'INVALID_STEP_STATUS', 'Invalid step status'],
    [404, 'STEP_NOT_FOUND', 'Step not found'],
  ])('keeps the %i code but does not treat it as already handled', async (status, code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(status, JSON.stringify({ success: false, code, error: message }))));

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 9, { status: 'approved' }));

    expect((err as Error).message).toBe(message);
    expect(err).toMatchObject({ status, code });
    expect(isStepAlreadyHandledError(err)).toBe(false);
  });

  it('falls back to a readable message when the 409 body is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(409, '')));

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 2, { status: 'approved' }));

    expect((err as Error).message).toBe('Failed to update workflow step (HTTP 409)');
    expect(err).toMatchObject({ status: 409, code: undefined });
    expect(isStepAlreadyHandledError(err)).toBe(true);
  });

  it('falls back to a readable message when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(502, '<html>Bad Gateway</html>')));

    const err = await rejectionOf(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 2, { status: 'approved' }));

    expect((err as Error).message).toBe('Failed to update workflow step (HTTP 502)');
    expect(isStepAlreadyHandledError(err)).toBe(false);
  });

  it('resolves on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200, JSON.stringify({ success: true }))));

    await expect(approvalWorkflowServiceMongoDB.updateWorkflowStep('wf-1', 2, { status: 'approved' })).resolves.toBeUndefined();
  });

  it('guard ignores anything that is not an Error carrying status 409', () => {
    expect(isStepAlreadyHandledError(new Error('boom'))).toBe(false);
    expect(isStepAlreadyHandledError(Object.assign(new Error('x'), { status: 500 }))).toBe(false);
    expect(isStepAlreadyHandledError({ status: 409, message: 'not an Error' })).toBe(false);
    expect(isStepAlreadyHandledError(null)).toBe(false);
    expect(isStepAlreadyHandledError(undefined)).toBe(false);
  });

  it('leaves the other methods returning plain server messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500, JSON.stringify({ success: false, error: 'Update failed' }))));

    await expect(approvalWorkflowServiceMongoDB.updateWorkflow('wf-1', { amount: 1 })).rejects.toThrow('Update failed');
  });
});
