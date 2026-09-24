import { getCmsUrl } from '../../scripts/site-config.mjs';

export { getCmsUrl };
export const SITE_NAME = 'Sandnes og Gjesdal Skiskytterlag';
export const SITE_DESCRIPTION =
  'Et fellesskap for treningsglede, mestring og utvikling. Bli med oss i Melsheia.';

export const CMS_URL = getCmsUrl(import.meta.env.PUBLIC_CMS_URL || undefined);
