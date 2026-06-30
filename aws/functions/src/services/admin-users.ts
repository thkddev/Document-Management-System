import {
  AdminListGroupsForUserCommand,
  ListUsersCommand,
  type CognitoIdentityProviderClient,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  userRoles,
  type AdminUserSummary,
  type DocumentPrincipal,
  type UserRole,
} from '../domain/models.js';

export interface ListAdminUsersDependencies {
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

export class AdminUsersForbiddenError extends Error {
  constructor() {
    super('Tài khoản không có quyền xem danh sách người dùng.');
    this.name = 'AdminUsersForbiddenError';
  }
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
