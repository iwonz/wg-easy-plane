# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or accidental secret exposure. Use the repository's private GitHub Security Advisory reporting flow.

Include the affected version, impact, minimal reproduction, and suggested mitigation when available. Do not include credentials, live node addresses, client configurations, database copies, or other personal data.

## Supported versions

Until the first release, only the current `master` branch receives security fixes. After the first stable release, this document will list the maintained release lines.

## Accidental exposure

If sensitive data is committed, revoke or rotate it first. Rewriting Git history does not make an already exposed credential safe.
