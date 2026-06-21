import { userRoles, type DocumentPrincipal, type UserRole } from '../domain/models.js';

export function parseUserRoles(rawGroups: unknown): UserRole[] {
  let groups: unknown[] = [];
  if (Array.isArray(rawGroups)) {
    groups = rawGroups;
  } else if (typeof rawGroups === 'string') {
    try {
      const parsed = JSON.parse(rawGroups) as unknown;
      groups = Array.isArray(parsed) ? parsed : rawGroups.split(',');
    } catch {
      groups = rawGroups.split(',');
    }
  }

  return groups
    .map((group) => (typeof group === 'string' ? group.trim() : ''))
    .filter((group): group is UserRole => userRoles.includes(group as UserRole));
}

export function documentPrincipalFromClaims(
  claims: Record<string, unknown> | undefined,
): DocumentPrincipal | null {
  const userId = claims?.sub;
  const departmentId = claims?.['custom:departmentId'];
  if (typeof userId !== 'string' || !userId || typeof departmentId !== 'string' || !departmentId) {
    return null;
  }
  return {
    userId,
    departmentId,
    roles: parseUserRoles(claims?.['cognito:groups']),
  };
}
