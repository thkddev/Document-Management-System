import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';

const mockGetCurrentAccessToken = vi.fn();
const mockSignOut = vi.fn();

vi.mock('./cognito', () => ({
  getCurrentAccessToken: () => mockGetCurrentAccessToken(),
  signOut: () => mockSignOut(),
}));

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentAccessToken.mockResolvedValue('access-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('signs out and notifies the app when the session expires', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
    const sessionExpired = vi.fn();
    window.addEventListener('dms:session-expired', sessionExpired);

    await expect(apiFetch('/me')).rejects.toMatchObject({
      status: 401,
      error: { code: 'SESSION_EXPIRED' },
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(sessionExpired).toHaveBeenCalledOnce();

    window.removeEventListener('dms:session-expired', sessionExpired);
  });
});
