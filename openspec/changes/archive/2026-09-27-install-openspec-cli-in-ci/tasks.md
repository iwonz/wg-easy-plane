## 1. Reproducible OpenSpec tooling

- [x] 1.1 Pin OpenSpec 1.11.0 in root development dependencies and update the frozen lockfile.
- [x] 1.2 Route repository validation scripts through the workspace-local OpenSpec executable.

## 2. Verification and delivery

- [x] 2.1 Validate the CLI version, strict active/archive specs, formatting, privacy, and the full repository verification command.
- [x] 2.2 Run gitleaks, archive this change, fast-forward it into `master`, push, remove the branch, and confirm the replacement CI run.
