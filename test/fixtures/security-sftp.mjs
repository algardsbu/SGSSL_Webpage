import { createHash } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import ssh2 from 'ssh2';

// A real loopback SSH/SFTP transport with an isolated, in-memory filesystem.
// No production credentials, SSH daemon, or external host is involved.
export async function sftpFixture(t, initialFiles = {}) {
    const key = ssh2.utils.generateKeyPairSync('ed25519');
    const fingerprint = `SHA256:${createHash('sha256').update(ssh2.utils.parseKey(key.private).getPublicSSH()).digest('base64').replace(/=+$/, '')}`;
    const files = new Map(Object.entries(initialFiles).map(([name, body]) => [name, Buffer.from(body)]));
    const directories = new Set(['/', '/www']);
    const symlinks = new Map();
    const operations = [];
    const connections = new Set();
    const faults = { write: undefined };
    for (const name of files.keys()) {
        let parent = path.posix.dirname(name);
        while (parent !== '/') { directories.add(parent); parent = path.posix.dirname(parent); }
    }
    const normalize = (name) => path.posix.resolve('/', name);
    const resolve = (name) => {
        let result = normalize(name);
        for (const [link, destination] of symlinks) {
            if (result === link || result.startsWith(`${link}/`)) result = `${destination}${result.slice(link.length)}`;
        }
        return result;
    };
    const attributes = (name, follow = true) => {
        const target = follow ? resolve(name) : normalize(name);
        if (!follow && symlinks.has(target)) return { mode: 0o120777, size: 0, uid: 1000, gid: 1000, atime: 1, mtime: 1 };
        const folder = directories.has(target);
        if (!folder && !files.has(target)) return undefined;
        return { mode: folder ? 0o040755 : 0o100644, size: files.get(target)?.length ?? 0, uid: 1000, gid: 1000, atime: 1, mtime: 1 };
    };
    const server = new ssh2.Server({ hostKeys: [key.private] }, (connection) => {
        connections.add(connection);
        connection.on('error', () => {});
        connection.on('close', () => connections.delete(connection));
        connection.on('authentication', (context) => {
            if (context.method === 'password' && context.username === 'fixture' && context.password === 'fixture-password') context.accept();
            else context.reject();
        });
        connection.on('ready', () => connection.on('session', (accept) => {
            const session = accept();
            session.on('sftp', (acceptSftp) => {
                const sftp = acceptSftp();
                // ssh2's server API sends a bare SFTP v3 handshake. Advertise
                // the standard atomic rename extension implemented below.
                const channelData = connection._protocol.channelData.bind(connection._protocol);
                connection._protocol.channelData = (channel, packet) => {
                    if (channel === sftp.outgoing.id && packet.length === 9 && packet[4] === 2) {
                        const string = (value) => { const data = Buffer.from(value); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([size, data]); };
                        packet = Buffer.concat([packet, string('posix-rename@openssh.com'), string('1')]);
                        packet.writeUInt32BE(packet.length - 4);
                    }
                    return channelData(channel, packet);
                };
                const handles = new Map();
                let nextHandle = 1;
                const status = (id, code = 0) => sftp.status(id, code);
                const openHandle = (id, value) => {
                    const handle = Buffer.alloc(4);
                    handle.writeUInt32BE(nextHandle++);
                    handles.set(handle.toString('hex'), value);
                    sftp.handle(id, handle);
                };
                const stat = (id, name, follow) => {
                    const attrs = attributes(name, follow);
                    if (attrs) sftp.attrs(id, attrs); else status(id, 2);
                };
                sftp.on('REALPATH', (id, name) => {
                    const filename = resolve(name);
                    sftp.name(id, [{ filename, longname: filename, attrs: attributes(filename) ?? {} }]);
                });
                sftp.on('STAT', (id, name) => stat(id, name, true));
                sftp.on('LSTAT', (id, name) => stat(id, name, false));
                sftp.on('FSTAT', (id, handle) => {
                    const opened = handles.get(handle.toString('hex'));
                    if (opened) stat(id, opened.name, true); else status(id, 4);
                });
                sftp.on('OPEN', (id, name, flags) => {
                    name = resolve(name);
                    if (!directories.has(path.posix.dirname(name))) return status(id, 2);
                    if ((flags & 32) && files.has(name)) return status(id, 4);
                    if (!files.has(name) && !(flags & 8)) return status(id, 2);
                    if (flags & 16 || !files.has(name)) files.set(name, Buffer.alloc(0));
                    openHandle(id, { name });
                });
                sftp.on('WRITE', (id, handle, offset, data) => {
                    const opened = handles.get(handle.toString('hex'));
                    if (!opened) return status(id, 4);
                    operations.push({ type: 'write', path: opened.name });
                    if (faults.write?.(opened.name)) return status(id, 4);
                    const previous = files.get(opened.name);
                    const contents = Buffer.alloc(Math.max(previous.length, offset + data.length));
                    previous.copy(contents);
                    data.copy(contents, offset);
                    files.set(opened.name, contents);
                    status(id);
                });
                sftp.on('READ', (id, handle, offset, length) => {
                    const opened = handles.get(handle.toString('hex'));
                    if (!opened) return status(id, 4);
                    const contents = files.get(opened.name);
                    if (offset >= contents.length) return status(id, 1);
                    sftp.data(id, contents.subarray(offset, offset + length));
                });
                sftp.on('CLOSE', (id, handle) => {
                    handles.delete(handle.toString('hex'));
                    status(id);
                });
                sftp.on('MKDIR', (id, name) => {
                    name = resolve(name);
                    if (!directories.has(path.posix.dirname(name)) || files.has(name)) return status(id, 4);
                    directories.add(name);
                    operations.push({ type: 'mkdir', path: name });
                    status(id);
                });
                sftp.on('REMOVE', (id, name) => {
                    name = normalize(name);
                    operations.push({ type: 'delete', path: name });
                    if (!files.delete(name) && !symlinks.delete(name)) return status(id, 2);
                    status(id);
                });
                sftp.on('RMDIR', (id, name) => {
                    name = normalize(name);
                    if ([...files.keys(), ...directories].some((child) => child.startsWith(`${name}/`))) return status(id, 4);
                    directories.delete(name);
                    status(id);
                });
                const rename = (id, source, destination) => {
                    source = resolve(source); destination = resolve(destination);
                    if (!files.has(source) || !directories.has(path.posix.dirname(destination))) return status(id, 2);
                    operations.push({ type: 'rename', path: source, destination });
                    files.set(destination, files.get(source)); files.delete(source);
                    status(id);
                };
                sftp.on('RENAME', rename);
                sftp.on('EXTENDED', (id, extension, data) => {
                    if (extension !== 'posix-rename@openssh.com') return status(id, 8);
                    let offset = 0;
                    const string = () => { const length = data.readUInt32BE(offset); offset += 4; const value = data.toString('utf8', offset, offset + length); offset += length; return value; };
                    rename(id, string(), string());
                });
                sftp.on('OPENDIR', (id, name) => {
                    name = resolve(name);
                    if (!directories.has(name)) return status(id, 2);
                    openHandle(id, { name, directory: true, read: false });
                });
                sftp.on('READDIR', (id, handle) => {
                    const opened = handles.get(handle.toString('hex'));
                    if (!opened?.directory) return status(id, 4);
                    if (opened.read) return status(id, 1);
                    opened.read = true;
                    const children = [...new Set([...directories, ...files.keys(), ...symlinks.keys()])].filter((name) => name !== opened.name && path.posix.dirname(name) === opened.name);
                    if (!children.length) return status(id, 1);
                    sftp.name(id, children.map((name) => ({ filename: path.posix.basename(name), longname: path.posix.basename(name), attrs: attributes(name, false) })));
                });
            });
        }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
        for (const connection of connections) connection.end();
        await new Promise((resolveClose) => server.close(resolveClose));
    });
    return {
        files, directories, symlinks, operations, faults, fingerprint,
        connection: { host: '127.0.0.1', port: server.address().port, username: 'fixture', password: 'fixture-password', readyTimeout: 2000 },
    };
}
