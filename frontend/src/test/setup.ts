import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Object.assign(import.meta.env, {
  VITE_API_BASE_URL: 'https://api.test.local',
  VITE_COGNITO_CLIENT_ID: 'test-client-id',
  VITE_COGNITO_USER_POOL_ID: 'ap-southeast-1_testpool',
});

afterEach(() => {
  cleanup();
});
