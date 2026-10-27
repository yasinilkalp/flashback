import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, checkTargetUrl, computeProjectId, loadConfig } from '../src/index.js';
import { tmpDir } from './helpers.js';

function project(name = 'demo') {
  const root = tmpDir('rewind-proj-');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name }));
  fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  return root;
}

describe('loadConfig (§9.4, FR-CFG-05)', () => {
  it('varsayılanlar', () => {
    const root = project();
    const c = loadConfig({}, { cwd: root, homedir: '/nonexistent-home' });
    expect(c.port).toBe(4747);
    expect(c.host).toBe('127.0.0.1');
    expect(c.dir).toBe(path.join(root, '.rewind'));
    expect(c.projectRoot).toBe(root);
    expect(c.allowOrigins).toEqual([]);
    expect(c.baseUrl).toBeUndefined();
    expect(c.storageState).toBeUndefined();
    expect(c.password).toBeUndefined();
    expect(c.maxBodyBytes).toBe(5 * 1024 * 1024);
    expect(c.retentionDays).toBe(30);
    expect(c.reproTimeoutS).toBe(60);
    expect(c.allowUnsafeAssertions).toBe(false);
    expect(c.noImages).toBe(false);
  });

  it('ortam değişkenleri uygulanır; zaman aşımı 300 sn ile sınırlı', () => {
    const root = project();
    const c = loadConfig(
      {
        REWIND_PORT: '5858',
        REWIND_ALLOW_ORIGINS: 'http://dev.local:3000/, https://app.test',
        REWIND_BASE_URL: 'http://localhost:3000',
        REWIND_STORAGE_STATE: 'state.json',
        REWIND_PASSWORD: 'pw',
        REWIND_MAX_BODY_MB: '2',
        REWIND_RETENTION_DAYS: '7',
        REWIND_REPRO_TIMEOUT_S: '999',
        REWIND_ALLOW_UNSAFE_ASSERTIONS: '1',
        REWIND_NO_IMAGES: '1',
      },
      { cwd: root, homedir: '/nonexistent-home' },
    );
    expect(c.port).toBe(5858);
    expect(c.allowOrigins).toEqual(['http://dev.local:3000', 'https://app.test']);
    expect(c.storageState).toBe(path.join(root, 'state.json'));
    expect(c.maxBodyBytes).toBe(2 * 1024 * 1024);
    expect(c.retentionDays).toBe(7);
    expect(c.reproTimeoutS).toBe(300);
    expect(c.allowUnsafeAssertions).toBe(true);
    expect(c.noImages).toBe(true);
  });

  it('olay klasörü sırası: REWIND_DIR > REWIND_PROJECT_ROOT/.rewind > yukarı doğru package.json (FR-RCV-03)', () => {
    const root = project();
    const other = project('other');
    const opts = { cwd: path.join(root, 'src', 'deep'), homedir: '/nonexistent-home' };
    expect(loadConfig({}, opts).dir).toBe(path.join(root, '.rewind'));
    expect(loadConfig({ REWIND_PROJECT_ROOT: other }, opts).dir).toBe(path.join(other, '.rewind'));
    expect(loadConfig({ REWIND_PROJECT_ROOT: other, REWIND_DIR: '/tmp/x-rewind' }, opts).dir).toBe('/tmp/x-rewind');
  });

  it('ev dizini ve kök dizin reddedilir', () => {
    const home = tmpDir('rewind-home-');
    expect(() => loadConfig({}, { cwd: home, homedir: home })).toThrow(ConfigError);
    expect(() => loadConfig({ REWIND_DIR: home }, { cwd: project(), homedir: home })).toThrow(/ev dizinine/);
    expect(() => loadConfig({ REWIND_PROJECT_ROOT: '/' }, { cwd: project(), homedir: home })).toThrow(ConfigError);
  });

  it('loopback dışı REWIND_HOST yalnızca --unsafe-expose ile (FR-RCV-SEC-03)', () => {
    const root = project();
    expect(() => loadConfig({ REWIND_HOST: '0.0.0.0' }, { cwd: root, homedir: '/x' })).toThrow(/loopback değil/);
    expect(loadConfig({ REWIND_HOST: '0.0.0.0' }, { cwd: root, homedir: '/x', unsafeExpose: true }).host).toBe('0.0.0.0');
    expect(loadConfig({ REWIND_HOST: 'localhost' }, { cwd: root, homedir: '/x' }).host).toBe('localhost');
  });

  it('projectId: kök yolu + package.json adı', () => {
    const a = project('a');
    expect(computeProjectId(a).projectId).toBe(computeProjectId(a).projectId);
    expect(computeProjectId(a).projectId).not.toBe(computeProjectId(project('a')).projectId);
    expect(computeProjectId(a).projectName).toBe('a');
  });

  it('repro hedefi: yalnızca loopback ya da izinli köken; file/data/javascript reddedilir (FR-REPRO-SEC-03)', () => {
    expect(checkTargetUrl('http://localhost:5173', []).ok).toBe(true);
    expect(checkTargetUrl('http://127.0.0.1:3000/app', []).ok).toBe(true);
    expect(checkTargetUrl('http://[::1]:3000', []).ok).toBe(true);
    expect(checkTargetUrl('https://example.com', []).ok).toBe(false);
    expect(checkTargetUrl('https://example.com', ['https://example.com']).ok).toBe(true);
    for (const bad of ['file:///etc/passwd', 'data:text/html,hi', 'javascript:alert(1)', 'http://192.168.1.5:3000', 'nonsense']) {
      expect(checkTargetUrl(bad, []).ok, bad).toBe(false);
    }
  });
});
