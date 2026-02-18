# Mnexium n8n Cloud Review Checklist

This checklist is for submitting `n8n-nodes-mnexium` to n8n Cloud verification.

## 1) Package quality gate (local)

Run:

```bash
npm install
npm run build
npm run lint
```

Expected: all commands pass.

## 2) Publish to npm (required before scan)

The official n8n scanner checks package metadata from npm.  
Run:

```bash
npm publish
```

Expected: package `n8n-nodes-mnexium` exists on npm.

## 3) Run official n8n scanner

After publish:

```bash
npm run scan:n8n
```

Expected: scanner passes with no critical issues.

Note: Running the scanner before publish returns npm `404 Not Found` because the package name is not yet indexed.

## 4) Submission package checks

- Package name starts with `n8n-nodes-`
- `n8n-community-node-package` keyword is present
- `LICENSE` included
- `README.md` is public-user focused and in English
- Node icon renders correctly in n8n
- Credentials do not force non-required keys for supported trial/free-tier flow
- Custom request is restricted to Mnexium domain and HTTPS

## 5) Creator Portal submission

Submit the package in n8n Creator Portal with:

- npm package name: `n8n-nodes-mnexium`
- repository URL
- documentation URL
- support/contact channel

## 6) Reviewer response prep

Prepare to provide quickly if requested:

- short test workflow JSON (one happy path + one error path)
- explanation of credential model (Mnexium key optional, provider keys conditional)
- security notes for custom request restrictions
