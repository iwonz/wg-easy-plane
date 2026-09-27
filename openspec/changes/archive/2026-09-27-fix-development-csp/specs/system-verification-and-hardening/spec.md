## MODIFIED Requirements

### Requirement: Both applications enforce browser defense-in-depth headers

Panel and subscription responses SHALL send a common Content Security Policy plus MIME-sniffing, framing, referrer, permissions, opener, resource, and transport-security headers. Development responses SHALL permit `unsafe-eval` only where required for the application runtime to hydrate, while production responses SHALL exclude `unsafe-eval`. Sensitive API and subscription responses SHALL continue to send private no-store caching directives.

#### Scenario: A browser requests either application

- **WHEN** the root page or health endpoint responds
- **THEN** the common security headers are present and prohibit embedding, plugins, external base URLs, and cross-origin opener/resource use

#### Scenario: A browser loads a development application

- **WHEN** either application runs in development mode and a browser requests its root page
- **THEN** the CSP permits the development runtime to hydrate and execute client initialization

#### Scenario: A browser loads a production application

- **WHEN** either application runs in production mode and a browser requests its root page
- **THEN** the CSP excludes `unsafe-eval` while retaining the common browser defenses
