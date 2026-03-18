const { describe, test, expect } = require('bun:test');
const cmd = require('../commands/rekognition.js');

const {
    isPrivateIP,
    isPrivateIPv4,
    isValidImageBuffer,
    isValidUrl,
    sanitizeExtension,
    UserFacingError,
    createPinnedAgent,
    validateAndResolveUrl,
} = cmd._test;

// --- isPrivateIP: IPv4 ---

describe('isPrivateIP (IPv4)', () => {
    test('blocks 127.0.0.1 (loopback)', () => expect(isPrivateIP('127.0.0.1')).toBe(true));
    test('blocks 127.255.255.255 (loopback range)', () => expect(isPrivateIP('127.255.255.255')).toBe(true));
    test('blocks 10.0.0.1 (class A private)', () => expect(isPrivateIP('10.0.0.1')).toBe(true));
    test('blocks 10.255.255.255', () => expect(isPrivateIP('10.255.255.255')).toBe(true));
    test('blocks 172.16.0.1 (class B private)', () => expect(isPrivateIP('172.16.0.1')).toBe(true));
    test('blocks 172.31.255.255', () => expect(isPrivateIP('172.31.255.255')).toBe(true));
    test('blocks 192.168.0.1 (class C private)', () => expect(isPrivateIP('192.168.0.1')).toBe(true));
    test('blocks 192.168.255.255', () => expect(isPrivateIP('192.168.255.255')).toBe(true));
    test('blocks 169.254.169.254 (AWS metadata)', () => expect(isPrivateIP('169.254.169.254')).toBe(true));
    test('blocks 169.254.0.1 (link-local)', () => expect(isPrivateIP('169.254.0.1')).toBe(true));
    test('blocks 0.0.0.0', () => expect(isPrivateIP('0.0.0.0')).toBe(true));
    test('blocks 100.64.0.1 (carrier-grade NAT)', () => expect(isPrivateIP('100.64.0.1')).toBe(true));
    test('blocks 100.127.255.255 (carrier-grade NAT end)', () => expect(isPrivateIP('100.127.255.255')).toBe(true));
    test('blocks 198.18.0.1 (benchmarking)', () => expect(isPrivateIP('198.18.0.1')).toBe(true));
    test('blocks 198.19.255.255 (benchmarking end)', () => expect(isPrivateIP('198.19.255.255')).toBe(true));
    test('blocks garbage input', () => expect(isPrivateIP('not-an-ip')).toBe(true));
    test('blocks empty string', () => expect(isPrivateIP('')).toBe(true));
    test('blocks partial IP', () => expect(isPrivateIP('192.168')).toBe(true));

    test('allows 8.8.8.8 (Google DNS)', () => expect(isPrivateIP('8.8.8.8')).toBe(false));
    test('allows 1.1.1.1 (Cloudflare)', () => expect(isPrivateIP('1.1.1.1')).toBe(false));
    test('allows 203.0.113.1 (public)', () => expect(isPrivateIP('203.0.113.1')).toBe(false));
    test('allows 172.15.255.255 (just below private B)', () => expect(isPrivateIP('172.15.255.255')).toBe(false));
    test('allows 172.32.0.1 (just above private B)', () => expect(isPrivateIP('172.32.0.1')).toBe(false));
    test('allows 100.63.255.255 (below carrier-grade NAT)', () => expect(isPrivateIP('100.63.255.255')).toBe(false));
    test('allows 100.128.0.1 (above carrier-grade NAT)', () => expect(isPrivateIP('100.128.0.1')).toBe(false));
    test('allows 198.17.255.255 (below benchmarking)', () => expect(isPrivateIP('198.17.255.255')).toBe(false));
    test('allows 198.20.0.1 (above benchmarking)', () => expect(isPrivateIP('198.20.0.1')).toBe(false));
});

// --- isPrivateIP: IPv6 ---

describe('isPrivateIP (IPv6)', () => {
    // Standard IPv6 private
    test('blocks ::1 (loopback)', () => expect(isPrivateIP('::1')).toBe(true));
    test('blocks 0:0:0:0:0:0:0:1 (expanded loopback)', () => expect(isPrivateIP('0:0:0:0:0:0:0:1')).toBe(true));
    test('blocks :: (unspecified)', () => expect(isPrivateIP('::')).toBe(true));
    test('blocks fe80::1 (link-local)', () => expect(isPrivateIP('fe80::1')).toBe(true));
    test('blocks fc00::1 (ULA)', () => expect(isPrivateIP('fc00::1')).toBe(true));
    test('blocks fd00::abc (ULA)', () => expect(isPrivateIP('fd00::abc')).toBe(true));

    // IPv4-mapped IPv6 — the critical SSRF bypass vector
    test('blocks ::ffff:127.0.0.1 (mapped loopback)', () => expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true));
    test('blocks ::ffff:169.254.169.254 (mapped AWS metadata)', () => expect(isPrivateIP('::ffff:169.254.169.254')).toBe(true));
    test('blocks ::ffff:10.0.0.1 (mapped class A)', () => expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true));
    test('blocks ::ffff:192.168.1.1 (mapped class C)', () => expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true));
    test('blocks ::ffff:172.16.0.1 (mapped class B)', () => expect(isPrivateIP('::ffff:172.16.0.1')).toBe(true));
    test('allows ::ffff:8.8.8.8 (mapped public)', () => expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false));
    test('allows ::ffff:1.1.1.1 (mapped Cloudflare)', () => expect(isPrivateIP('::ffff:1.1.1.1')).toBe(false));

    // IPv4-compatible IPv6 (deprecated but parsed)
    test('blocks ::127.0.0.1 (compatible loopback)', () => expect(isPrivateIP('::127.0.0.1')).toBe(true));
    test('blocks ::10.0.0.1 (compatible class A)', () => expect(isPrivateIP('::10.0.0.1')).toBe(true));
    test('blocks ::169.254.169.254 (compatible metadata)', () => expect(isPrivateIP('::169.254.169.254')).toBe(true));

    // 6to4 addresses (2002:XXYY:ZZWW:: encodes IPv4)
    test('blocks 2002:7f00:0001:: (6to4 encoding 127.0.0.1)', () => expect(isPrivateIP('2002:7f00:0001::')).toBe(true));
    test('blocks 2002:a9fe:a9fe:: (6to4 encoding 169.254.169.254)', () => expect(isPrivateIP('2002:a9fe:a9fe::')).toBe(true));
    test('blocks 2002:0a00:0001:: (6to4 encoding 10.0.0.1)', () => expect(isPrivateIP('2002:0a00:0001::')).toBe(true));
    test('allows 2002:0808:0808:: (6to4 encoding 8.8.8.8)', () => expect(isPrivateIP('2002:0808:0808::')).toBe(false));

    // Teredo
    test('blocks 2001:0000:... (Teredo)', () => expect(isPrivateIP('2001:0000:4136:e378:8000:63bf:3fff:fdd2')).toBe(true));
    test('blocks 2001:0:... (Teredo short)', () => expect(isPrivateIP('2001:0:4136:e378::')).toBe(true));

    // Public IPv6
    test('allows 2607:f8b0:4004:800::200e (Google)', () => expect(isPrivateIP('2607:f8b0:4004:800::200e')).toBe(false));
    test('allows 2606:4700:: (Cloudflare)', () => expect(isPrivateIP('2606:4700::6810:85e5')).toBe(false));
});

// --- isValidImageBuffer ---

describe('isValidImageBuffer', () => {
    // Valid images (need >=12 bytes now)
    test('recognizes JPEG', () => {
        expect(isValidImageBuffer(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]))).toBe(true);
    });

    test('recognizes PNG', () => {
        expect(isValidImageBuffer(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]))).toBe(true);
    });

    test('recognizes GIF', () => {
        expect(isValidImageBuffer(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]))).toBe(true);
    });

    test('recognizes BMP with valid file size', () => {
        // BM header + file size 100 (little-endian: 0x64, 0x00, 0x00, 0x00) + padding
        expect(isValidImageBuffer(Buffer.from([0x42, 0x4D, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00]))).toBe(true);
    });

    test('rejects BMP with too-small file size', () => {
        // BM header + file size 10 (too small for valid BMP)
        expect(isValidImageBuffer(Buffer.from([0x42, 0x4D, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBe(false);
    });

    test('recognizes WebP (RIFF + WEBP)', () => {
        // RIFF....WEBP
        expect(isValidImageBuffer(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))).toBe(true);
    });

    test('rejects RIFF without WEBP sub-header (AVI)', () => {
        // RIFF....AVI
        expect(isValidImageBuffer(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20]))).toBe(false);
    });

    test('rejects RIFF without WEBP sub-header (WAV)', () => {
        // RIFF....WAVE
        expect(isValidImageBuffer(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]))).toBe(false);
    });

    // Rejections
    test('rejects empty buffer', () => expect(isValidImageBuffer(Buffer.from([]))).toBe(false));
    test('rejects null', () => expect(isValidImageBuffer(null)).toBe(false));
    test('rejects undefined', () => expect(isValidImageBuffer(undefined)).toBe(false));
    test('rejects buffer too short', () => expect(isValidImageBuffer(Buffer.from([0xFF, 0xD8]))).toBe(false));
    test('rejects random data', () => {
        expect(isValidImageBuffer(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B]))).toBe(false);
    });
    test('rejects text content', () => expect(isValidImageBuffer(Buffer.from('hello world!!'))).toBe(false));
    test('rejects HTML', () => expect(isValidImageBuffer(Buffer.from('<html>aaaaaa'))).toBe(false));
    test('rejects ELF binary', () => {
        expect(isValidImageBuffer(Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBe(false);
    });
    test('rejects PDF', () => expect(isValidImageBuffer(Buffer.from('%PDF-1.4.aaa'))).toBe(false));
    test('rejects ZIP', () => {
        expect(isValidImageBuffer(Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBe(false);
    });
    test('rejects "BM" text that starts with BMP magic but has invalid size', () => {
        expect(isValidImageBuffer(Buffer.from('BM\x00\x00\x00\x00aaaaaa'))).toBe(false);
    });
});

// --- isValidUrl ---

describe('isValidUrl', () => {
    test('accepts https URL', () => expect(isValidUrl('https://example.com/img.png')).toBe(true));
    test('accepts http URL', () => expect(isValidUrl('http://example.com/img.png')).toBe(true));
    test('rejects ftp URL', () => expect(isValidUrl('ftp://example.com/img.png')).toBe(false));
    test('rejects file URL', () => expect(isValidUrl('file:///etc/passwd')).toBe(false));
    test('rejects javascript URL', () => expect(isValidUrl('javascript:alert(1)')).toBe(false));
    test('rejects data URL', () => expect(isValidUrl('data:image/png;base64,abc')).toBe(false));
    test('rejects empty string', () => expect(isValidUrl('')).toBe(false));
    test('rejects null', () => expect(isValidUrl(null)).toBe(false));
    test('rejects undefined', () => expect(isValidUrl(undefined)).toBe(false));
    test('rejects plain text', () => expect(isValidUrl('not a url')).toBe(false));
    test('rejects URL over 2048 chars', () => {
        expect(isValidUrl('https://example.com/' + 'a'.repeat(2048))).toBe(false);
    });
    test('accepts URL at 2048 chars', () => {
        const url = 'https://example.com/' + 'a'.repeat(2028);
        expect(url.length).toBe(2048);
        expect(isValidUrl(url)).toBe(true);
    });
});

// --- sanitizeExtension ---

describe('sanitizeExtension', () => {
    test('allows .jpg', () => expect(sanitizeExtension('/img.jpg')).toBe('.jpg'));
    test('allows .jpeg', () => expect(sanitizeExtension('/img.jpeg')).toBe('.jpeg'));
    test('allows .png', () => expect(sanitizeExtension('/img.png')).toBe('.png'));
    test('allows .gif', () => expect(sanitizeExtension('/img.gif')).toBe('.gif'));
    test('allows .bmp', () => expect(sanitizeExtension('/img.bmp')).toBe('.bmp'));
    test('allows .webp', () => expect(sanitizeExtension('/img.webp')).toBe('.webp'));
    test('normalizes to lowercase', () => expect(sanitizeExtension('/img.JPG')).toBe('.jpg'));
    test('defaults .js to .jpg', () => expect(sanitizeExtension('/evil.js')).toBe('.jpg'));
    test('defaults .sh to .jpg', () => expect(sanitizeExtension('/evil.sh')).toBe('.jpg'));
    test('defaults .exe to .jpg', () => expect(sanitizeExtension('/evil.exe')).toBe('.jpg'));
    test('defaults .html to .jpg', () => expect(sanitizeExtension('/page.html')).toBe('.jpg'));
    test('defaults no extension to .jpg', () => expect(sanitizeExtension('/noext')).toBe('.jpg'));
    test('defaults empty to .jpg', () => expect(sanitizeExtension('')).toBe('.jpg'));
});

// --- UserFacingError ---

describe('UserFacingError', () => {
    test('is instanceof Error', () => {
        expect(new UserFacingError('test') instanceof Error).toBe(true);
    });
    test('has correct name', () => {
        expect(new UserFacingError('test').name).toBe('UserFacingError');
    });
    test('preserves message', () => {
        expect(new UserFacingError('hello').message).toBe('hello');
    });
});

// --- createPinnedAgent ---

describe('createPinnedAgent', () => {
    test('creates http.Agent for http:', () => {
        const agent = createPinnedAgent('http:', '1.2.3.4', 4);
        expect(agent).toBeDefined();
        expect(agent.constructor.name).toBe('Agent');
    });

    test('creates https.Agent for https:', () => {
        const agent = createPinnedAgent('https:', '1.2.3.4', 4);
        expect(agent).toBeDefined();
    });

    test('lookup callback returns pinned address', (done) => {
        const agent = createPinnedAgent('http:', '93.184.216.34', 4);
        agent.options.lookup('anything.example.com', {}, (err, address, family) => {
            expect(err).toBeNull();
            expect(address).toBe('93.184.216.34');
            expect(family).toBe(4);
            done();
        });
    });
});

// --- validateAndResolveUrl ---

describe('validateAndResolveUrl', () => {
    test('rejects URL with private IP hostname', async () => {
        await expect(validateAndResolveUrl('http://127.0.0.1/img.png'))
            .rejects.toThrow('private or internal');
    });

    test('rejects URL with 169.254.169.254 (metadata)', async () => {
        await expect(validateAndResolveUrl('http://169.254.169.254/latest/'))
            .rejects.toThrow('private or internal');
    });

    test('rejects URL with 10.x.x.x', async () => {
        await expect(validateAndResolveUrl('http://10.0.0.1/img.png'))
            .rejects.toThrow('private or internal');
    });

    test('rejects URL with 192.168.x.x', async () => {
        await expect(validateAndResolveUrl('http://192.168.1.1/img.png'))
            .rejects.toThrow('private or internal');
    });

    test('resolves valid public URL', async () => {
        const result = await validateAndResolveUrl('https://example.com/img.png');
        expect(result).toHaveProperty('address');
        expect(result).toHaveProperty('family');
        expect(isPrivateIP(result.address)).toBe(false);
    });
});

// --- Module exports ---

describe('module exports', () => {
    test('exports data with correct command name', () => {
        expect(cmd.data.name).toBe('rekognition');
    });

    test('exports execute function', () => {
        expect(typeof cmd.execute).toBe('function');
    });

    test('has analyze and compare subcommands', () => {
        const names = cmd.data.options.map(o => o.name);
        expect(names).toContain('analyze');
        expect(names).toContain('compare');
    });

    test('DM permission is disabled', () => {
        expect(cmd.data.dm_permission).toBe(false);
    });
});
