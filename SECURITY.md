<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately**, using GitHub's private vulnerability
reporting: open the [Security tab](https://github.com/dokterbob/mutuvia/security) on this
repository and choose **Report a vulnerability**. This opens a private advisory visible only to
the maintainers until it's resolved — please do not open a public issue or pull request for a
security problem.

> **Maintainer note**: private vulnerability reporting must be enabled once in this repository's
> settings (Settings → Security → Enable "Private vulnerability reporting") before the link above
> will work. If it isn't enabled yet, use the security contact listed on the maintainer's GitHub
> profile instead.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce it (a minimal reproduction is ideal)
- The version/commit you tested against

## Scope

This covers the Mutuvia application itself (this repository: the SvelteKit app, its Docker image,
the Android TWA shell under `android/`, and CI/CD workflows). It does not cover the security of a
specific third-party deployment's own infrastructure (hosting, reverse proxy, TLS certificates,
etc.) unless the vulnerability is in how this app's own code or documented configuration
guidance (see the README's "Security headers" and "Reverse proxy, TLS and NODE_ENV" sections)
handles those concerns.

## Supported versions

This is a young, pre-1.0 project without parallel maintained release branches. Security fixes land
on `main` and the latest tagged release; please upgrade to the latest release before reporting an
issue that may already be fixed.
