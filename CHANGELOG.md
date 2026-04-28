# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-20

### New Features
- Docker support — production-ready `Dockerfile` with read-only filesystem, tmpfs temp dir, memory/CPU limits, and `no-new-privileges` security option
- Unit test suite — 110 tests covering SSRF validation, magic bytes detection, rate limiting, error sanitization, and command logic

### Security
- SSRF protection — DNS pre-resolution + private IP blocking (IPv4, IPv6 including mapped/compatible/6to4/Teredo addresses) + pinned HTTP agents to prevent DNS rebinding attacks
- Path traversal prevention — random filenames with extension allowlist; no user input reaches file paths
- Magic bytes validation — file signatures verified for JPEG, PNG, GIF, BMP, WebP (including WebP sub-header)
- Rate limiting — per-user 5s cooldown + global concurrency cap (10 simultaneous requests)
- Error sanitization — `UserFacingError` class gates all user-visible messages; AWS errors are never leaked to Discord
- Discord CDN origin enforcement — attachment downloads restricted to `cdn.discordapp.com`

### Bug Fixes
- Restore `.env.example` with all required and optional environment variables documented
- Sanitize error logging to prevent sensitive data appearing in server logs

## [1.0.0] - 2025-06-21

- Initial release
