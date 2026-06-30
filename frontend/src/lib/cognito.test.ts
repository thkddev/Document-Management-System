import { describe, expect, it } from 'vitest';
import { mapCognitoAuthFailure } from './cognito';

describe('mapCognitoAuthFailure', () => {
  it('hiển thị lỗi riêng khi Cognito trả UserDisabledException', () => {
    const error = mapCognitoAuthFailure({ code: 'UserDisabledException' });

    expect(error.code).toBe('UserDisabledException');
    expect(error.message).toBe('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
  });

  it('hiển thị lỗi bị khóa khi NotAuthorizedException có message disabled', () => {
    const error = mapCognitoAuthFailure({
      code: 'NotAuthorizedException',
      message: 'User is disabled.',
    });

    expect(error.code).toBe('NotAuthorizedException');
    expect(error.message).toBe('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
  });

  it('vẫn ẩn chi tiết khi sai email hoặc mật khẩu', () => {
    const error = mapCognitoAuthFailure({ code: 'NotAuthorizedException' });

    expect(error.message).toBe('Email hoặc mật khẩu không đúng.');
  });
});
