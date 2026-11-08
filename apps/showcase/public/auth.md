# auth.md — AI Agent Access & Authentication Policy

This document defines the agent registration, authentication, and access protocols for autonomous AI agents, scrapers, and LLM clients interacting with https://asr.firetable.tech.

## 1. Agent Audience

This specification applies to all autonomous agents, developer tools, web crawlers, AI search engines (SearchGPT, Perplexity, Claude, Gemini, Cursor, Copilot), and multi-agent systems accessing public pages, Markdown documentation, and manifests hosted on `https://asr.firetable.tech`.

## 2. Authentication Model: Public & Anonymous Access

The website, SDK documentation, and LLM knowledge manifests are **100% open and publicly accessible**. No pre-registration, API keys, OAuth tokens, or human-in-the-loop claim workflows are required to read or parse content.

- **identity_types_supported**: `["anonymous"]`
- **anonymous.credential_types_supported**: `["none"]`
- **register_uri**: `https://asr.firetable.tech/auth.md`
- **claim_uri**: `https://asr.firetable.tech/auth.md`
- **Registration**: Not required for read-only access.
- **Credential Types**: `none` (All GET endpoints are unauthenticated).
- **Claim Flow**: Not required (`claim_uri`: `https://asr.firetable.tech/auth.md`).

## 3. Supported Endpoints

All endpoints support direct HTTP GET requests:

| Resource | Path | Format | Description |
| :--- | :--- | :--- | :--- |
| **Site Manifest** | `/llms.txt` | `text/markdown` | Structured project summary, SDK usage & documentation index |
| **Full Corpus** | `/llms-full.txt` | `text/markdown` | Complete technical reference, SDK API, and benchmarks |
| **Open Graph Card**| `/og.png` | `image/png` | 1200x630 high-resolution social preview card |
| **Sitemap** | `/sitemap.xml` | `application/xml` | Machine-readable URL hierarchy & alternate language mappings |
| **Robots Directives**| `/robots.txt` | `text/plain` | Crawler and AI crawler access rules & Content-Signal header |
| **Agent Auth Policy**| `/auth.md` | `text/markdown` | AI Agent registration & authentication policy |

## 4. Rate Limiting & Etiquette

Standard edge rate limits apply. Agents are requested to observe the directives in `https://asr.firetable.tech/robots.txt` and honor standard `Retry-After` headers when applicable.
