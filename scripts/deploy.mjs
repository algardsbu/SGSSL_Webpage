import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import SftpClient from 'ssh2-sftp-client';
import { deploySite, validateRemoteRoot } from './deploy-lib.mjs';
import { getSiteUrl } from './site-config.mjs';

export function deploymentConfig(env = process.env) {
  if (env.DEPLOY_ENABLED !== 'true') return null;
  const required = ['SITE_URL', 'SFTP_HOST', 'SFTP_USERNAME', 'SFTP_PASSWORD', 'SFTP_REMOTE_DIR', 'SFTP_HOST_KEY_SHA256'];
  for (const key of required) if (!env[key]?.trim()) throw new Error(`Deployment requires ${key}`);
  getSiteUrl(env.SITE_URL, { required: true });
  const remoteRoot = validateRemoteRoot(env.SFTP_REMOTE_DIR);
  if (!/^[a-z0-9.-]+$/i.test(env.SFTP_HOST) || !/^[a-z0-9_.@-]+$/i.test(env.SFTP_USERNAME)) throw new Error('Invalid SFTP host or username');
  const fingerprint = env.SFTP_HOST_KEY_SHA256.replace(/^SHA256:/, '').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw new Error('Provide a verified OpenSSH SHA256 host-key fingerprint');
  const expected = Buffer.from(fingerprint, 'base64');
  const port = Number(env.SFTP_PORT || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SFTP port');
  return {
    remoteRoot,
    connection: {
      host: env.SFTP_HOST,
      port,
      username: env.SFTP_USERNAME,
      password: env.SFTP_PASSWORD,
      hostHash: 'sha256',
      hostVerifier: (hex) => {
        const actual = Buffer.from(hex, 'hex');
        return actual.length === expected.length && timingSafeEqual(actual, expected);
      },
      readyTimeout: 20000,
    },
  };
}

async function main() {
  const config = deploymentConfig();
  if (!config) { console.log('Deployment disabled. Set DEPLOY_ENABLED=true after completing docs/deployment.md.'); return; }
  const client = new SftpClient('sgssl-deploy');
  try {
    await client.connect(config.connection);
    const result = await deploySite(client, { distDir: path.resolve('dist'), remoteRoot: config.remoteRoot });
    console.log(`Deployed ${result.upload.length} files; removed ${result.remove.length} obsolete managed files.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
