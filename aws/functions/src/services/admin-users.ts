import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  ListUsersCommand,
  type CognitoIdentityProviderClient,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  userRoles,
  type AdminUserSummary,
  type CreateAdminUserRequest,
  type DocumentPrincipal,
  type UserRole,
} from '../domain/models.js';

export interface ListAdminUsersDependencies {
  cognito: Pick<CognitoIdentityProviderClient, 'send'>;
  userPoolId: string;
}

export interface CreateAdminUserDependencies {
  cognito: Pick<CognitoIdentityProviderClient, 'send'>;
  userPoolId: string;
}

export function canListAdminUsers(principal: DocumentPrincipal): boolean {
  return principal.roles.includes('SYSTEM_ADMIN');
}

export async function listAdminUsers(
  principal: DocumentPrincipal,
  deps: ListAdminUsersDependencies,
): Promise<AdminUserSummary[]> {
  if (!canListAdminUsers(principal)) {
    throw new AdminUsersForbiddenError();
  }

  const users: UserType[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await deps.cognito.send(
      new ListUsersCommand({
        UserPoolId: deps.userPoolId,
        PaginationToken: paginationToken,
        Limit: 60,
      }),
    );
    users.push(...(response.Users ?? []));
    paginationToken = response.PaginationToken;
  } while (paginationToken);

  const summaries = await Promise.all(
    users.map(async (user) => {
      const username = user.Username ?? '';
      const groups = username
        ? await deps.cognito.send(
            new AdminListGroupsForUserCommand({
              UserPoolId: deps.userPoolId,
              Username: username,
            }),
          )
        : { Groups: [] };

      return toAdminUserSummary(user, groups.Groups?.map((group) => group.GroupName) ?? []);
    }),
  );

  return summaries.sort((left, right) => left.email.localeCompare(right.email, 'vi'));
}

export async function createAdminUser(
  principal: DocumentPrincipal,
  request: CreateAdminUserRequest,
  deps: CreateAdminUserDependencies,
): Promise<AdminUserSummary> {
  if (!canListAdminUsers(principal)) {
    throw new AdminUsersForbiddenError();
  }

  const normalized = normalizeCreateAdminUserRequest(request);

  try {
    const createResponse = await deps.cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: deps.userPoolId,
        Username: normalized.email,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: normalized.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: normalized.name },
          { Name: 'custom:departmentId', Value: normalized.departmentId },
        ],
      }),
    );

    await deps.cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: deps.userPoolId,
        Username: normalized.email,
        Password: normalized.password,
        Permanent: true,
      }),
    );

    await deps.cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: deps.userPoolId,
        Username: normalized.email,
        GroupName: normalized.role,
      }),
    );

    return {
      ...toAdminUserSummary(createResponse.User ?? { Username: normalized.email }, [normalized.role]),
      email: normalized.email,
      name: normalized.name,
      departmentId: normalized.departmentId,
      roles: [normalized.role],
      status: 'CONFIRMED',
      enabled: true,
    };
  } catch (err) {
    const errorName = err instanceof Error ? err.name : '';
    if (errorName === 'UsernameExistsException') {
      throw new AdminUserAlreadyExistsError(normalized.email);
    }
    if (errorName === 'InvalidPasswordException') {
      throw new AdminUserValidationError([
        { field: 'password', message: 'Mật khẩu không đúng chính sách Cognito.' },
      ]);
    }
    throw err;
  }
}

export class AdminUsersForbiddenError extends Error {
  constructor() {
    super('Tài khoản không có quyền xem danh sách người dùng.');
    this.name = 'AdminUsersForbiddenError';
  }
}

export class AdminUserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email ${email} đã tồn tại trong Cognito.`);
    this.name = 'AdminUserAlreadyExistsError';
  }
}

export interface AdminUserValidationIssue {
  field: string;
  message: string;
}

export class AdminUserValidationError extends Error {
  constructor(public readonly issues: AdminUserValidationIssue[]) {
    super('Thông tin người dùng không hợp lệ.');
    this.name = 'AdminUserValidationError';
  }
}

function normalizeCreateAdminUserRequest(request: CreateAdminUserRequest): CreateAdminUserRequest {
  const issues: AdminUserValidationIssue[] = [];
  const email = typeof request.email === 'string' ? request.email.trim().toLocaleLowerCase('vi') : '';
  const name = typeof request.name === 'string' ? request.name.trim() : '';
  const departmentId =
    typeof request.departmentId === 'string' ? request.departmentId.trim().toUpperCase() : '';
  const role = request.role;
  const password = typeof request.password === 'string' ? request.password : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({ field: 'email', message: 'Email không hợp lệ.' });
  }
  if (!name) {
    issues.push({ field: 'name', message: 'Tên hiển thị không được để trống.' });
  }
  if (!departmentId) {
    issues.push({ field: 'departmentId', message: 'Phòng ban không được để trống.' });
  }
  if (!userRoles.includes(role)) {
    issues.push({ field: 'role', message: 'Vai trò không hợp lệ.' });
  }
  if (password.length < 8) {
    issues.push({ field: 'password', message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
  }

  if (issues.length > 0) {
    throw new AdminUserValidationError(issues);
  }

  return { email, name, departmentId, role, password };
}

function toAdminUserSummary(user: UserType, rawGroups: Array<string | undefined>): AdminUserSummary {
  const attributes = new Map(
    (user.Attributes ?? [])
      .filter((attribute) => attribute.Name)
      .map((attribute) => [attribute.Name!, attribute.Value ?? '']),
  );
  const roles = rawGroups.filter((group): group is UserRole =>
    userRoles.includes(group as UserRole),
  );
  const fallbackName = attributes.get('email') ?? user.Username ?? 'Chưa có tên';

  return {
    id: attributes.get('sub') || user.Username || fallbackName,
    name: attributes.get('name') || fallbackName,
    email: (attributes.get('email') || fallbackName).toLocaleLowerCase('vi'),
    departmentId: attributes.get('custom:departmentId') || 'UNKNOWN',
    roles,
    status: user.UserStatus ?? 'UNKNOWN',
    enabled: user.Enabled ?? false,
    createdAt: user.UserCreateDate?.toISOString() ?? '',
    updatedAt: user.UserLastModifiedDate?.toISOString() ?? '',
  };
}
