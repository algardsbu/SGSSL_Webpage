export const DEFAULT_CMS_URL = 'https://app.pagescms.org';

function validateRawUrl(value) {
  if (typeof value !== 'string' || /[\x00-\x20\x7f<>"'\\]/.test(value)) {
    throw new Error('URL must not contain whitespace, control characters or unescaped markup.');
  }
}

export function getCmsUrl(value = DEFAULT_CMS_URL) {
  validateRawUrl(value || DEFAULT_CMS_URL);
  const url = new URL(value || DEFAULT_CMS_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('PUBLIC_CMS_URL must be an HTTPS URL without credentials or a fragment.');
  }
  return url.href;
}

export function getSiteUrl(value, { required = false } = {}) {
  if (!value) {
    if (required) throw new Error('SITE_URL must be set to the real production HTTPS domain.');
    return undefined;
  }
  validateRawUrl(value);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SITE_URL must be an HTTPS origin without credentials, path, query or fragment.');
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /(^|\.)(localhost|example|invalid|test)$/.test(host) || /(^|\.)example\.(com|org|net)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':')) {
    throw new Error('SITE_URL must use the real production domain, not a placeholder or local address.');
  }
  return url.origin;
}
