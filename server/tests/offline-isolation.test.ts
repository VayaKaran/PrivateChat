import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero External Dependencies & Offline Isolation', () => {
  it('verifies built client index.html contains no external script, style, or font tags', () => {
    const indexPath = path.resolve(__dirname, '../../client/dist/index.html');
    expect(fs.existsSync(indexPath)).toBe(true);

    const htmlContent = fs.readFileSync(indexPath, 'utf-8');

    // Known CDNs and third-party trackers
    const forbiddenPatterns = [
      'https://cdn.jsdelivr.net',
      'https://cdnjs.cloudflare.com',
      'https://unpkg.com',
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://use.fontawesome.com',
      'https://code.jquery.com',
      'https://www.google-analytics.com',
      'https://connect.facebook.net',
      'http://',
    ];

    for (const pattern of forbiddenPatterns) {
      expect(htmlContent.includes(pattern)).toBe(false);
    }
  });

  it('verifies built client JS bundles make no calls to external third-party telemetry, CDNs or analytics', () => {
    const assetsDir = path.resolve(__dirname, '../../client/dist/assets');
    expect(fs.existsSync(assetsDir)).toBe(true);

    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    const forbiddenDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'mixpanel.com',
      'segment.io',
      'sentry.io',
      'datadoghq.com',
      'facebook.com',
      'doubleclick.net',
    ];

    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');
      for (const domain of forbiddenDomains) {
        expect(content.includes(domain)).toBe(false);
      }
    }
  });

  it('verifies strict Content Security Policy forbids third-party script, style, and connect sources', () => {
    // In CSP: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:;
    // We already enforce this in securityHeaders.ts and verify it in security.test.ts
    const cspFile = path.resolve(__dirname, '../src/middleware/securityHeaders.ts');
    const content = fs.readFileSync(cspFile, 'utf-8');

    expect(content).toContain("default-src 'self'");
    expect(content).toContain("script-src 'self'");
    expect(content).toContain("connect-src 'self'");
  });
});
