import type { AuthResult, AuthTokens, AuthUser } from '@/types';

const ACCESS_KEY = 'gc.accessToken';
const REFRESH_KEY = 'gc.refreshToken';
const USER_KEY = 'gc.user';

let accessToken: string | null = localStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
let currentUser: AuthUser | null = readUser();

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export const session = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => refreshToken,
  getUser: () => currentUser,

  set(result: AuthResult): void {
    accessToken = result.tokens.accessToken;
    refreshToken = result.tokens.refreshToken;
    currentUser = result.user;
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  },

  setTokens(tokens: AuthTokens): void {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },

  setUser(user: AuthUser): void {
    currentUser = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clear(): void {
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
