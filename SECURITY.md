# Security Policy

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory or contacting the project maintainers through the repository.

Do not disclose vulnerabilities publicly until maintainers have had time to investigate and prepare a fix.

## Security Principles

- Nolia Reader processes document content locally in the browser.
- Markdown HTML is sanitized before rendering.
- The extension does not load remote executable code.
- Host permissions should remain optional and scoped to user-approved origins.
- New export or conversion features must avoid transmitting document content unless the user explicitly asks for that behavior.
