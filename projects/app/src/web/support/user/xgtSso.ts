export function buildXgtSsoAuthUrl({
  authUrl,
  redirectUrl
}: {
  authUrl: string;
  redirectUrl: string;
}): string {
  const url = new URL(authUrl);
  url.searchParams.set('systemId', 'login');
  url.searchParams.set('mode', 'simple');
  url.searchParams.set('redirect', redirectUrl);
  return url.toString();
}

export function omitUrlQueryParams(urlStr: string, keys: string[]): string {
  const url = new URL(urlStr);
  keys.forEach((key) => url.searchParams.delete(key));
  return url.toString();
}
