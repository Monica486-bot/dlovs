// Only follow in-app paths after login, never an arbitrary URL passed in a
// deep link's returnTo parameter.
export function safeReturnTo(returnTo: string | string[] | undefined): string {
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
