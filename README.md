# n8n-nodes-mnexium

Official Mnexium community node for n8n.

Use Mnexium to add persistent memory, structured claims, profiles, state, records, prompts, and audit visibility to your AI workflows.

Docs: [https://www.mnexium.com/docs](https://www.mnexium.com/docs)

## Installation

Install in your n8n environment:

```bash
npm install n8n-nodes-mnexium
```

Restart n8n after installation.

## Credentials

Credential type: `Mnexium API + Model Keys`

- `Mnexium API Key`: optional for supported trial/free-tier flows
- `OpenAI API Key`: optional, sent as `x-openai-key` when provided
- `Anthropic API Key`: optional, sent as `x-anthropic-key` when provided
- `Google API Key`: optional, sent as `x-google-key` when provided

Notes:

- You can run some flows with an empty Mnexium key (trial provisioning).
- Provider keys are still required when the selected model/provider requires them.

## Supported Resources And Operations

| Resource | Operations |
| --- | --- |
| Chat | Message a Model |
| Chat History | List Chats, Read Chat, Delete Chat |
| Memory | List, Search, Create, Get, Update, Delete, List Superseded, Restore, List Recall Events, Get Claims For Memory |
| Claim | Get Truth, Get Slot Value, Get History, List Slots, Get Graph, Create, Get, Retract |
| Profile | Get Profile, Update Fields, Delete Field, Get Schema |
| State | Get, Set, Delete |
| Record Schema | List Schemas, Create/Update Schema, Get Schema |
| Record | List, Create, Get, Update, Delete, Query, Search |
| System Prompt | List, Create, Get, Update, Delete, Resolve |
| Memory Policy | List, Create, Get, Update, Delete, Resolve |
| Audit | List |
| Custom Request | Custom API Call |

## Quick Start

1. Add a `Mnexium` node to a workflow.
2. Select `Resource: Chat` and `Operation: Message a Model`.
3. Set `Model` (for example `gpt-4.1-mini`).
4. Set `User Message` directly or pass text from incoming JSON.
5. Execute and inspect response data.

## Chat Input Behavior

For `Chat -> Message a Model`:

- `User Message` is the primary input.
- If empty, the node can fall back to incoming fields such as `message`, `text`, `input`, or `prompt`.
- Optional Mnexium controls include `subject_id`, `chat_id`, `learn`, `history`, `recall`, `log`, and summarization/prompt policy options.

## Custom API Call

Custom API call is available only at `Resource: Custom Request`.

Inputs:

- HTTP Method
- Path
- Headers (JSON)
- Query Params (JSON)
- Body (JSON) for non-GET methods

Security:

- Absolute URLs are restricted to HTTPS on `mnexium.com` and `www.mnexium.com`.
- Relative paths are resolved against `https://www.mnexium.com`.

## Troubleshooting

- `401 Unauthorized`:
  - Check Mnexium key and provider keys.
  - Verify backend deployment/state for your Mnexium environment.
- No model response:
  - Confirm provider key matches the chosen model provider.
- `scan:n8n` returns `404`:
  - Publish package to npm first, then run scanner.

## Development

```bash
npm install
npm run build
npm run lint
```

Cloud review helper:

```bash
npm run scan:n8n
```

## Links

- Mnexium docs: [https://www.mnexium.com/docs](https://www.mnexium.com/docs)
- Repository: [https://github.com/mnexium/n8n-nodes-mnexium](https://github.com/mnexium/n8n-nodes-mnexium)
- Issues: [https://github.com/mnexium/n8n-nodes-mnexium/issues](https://github.com/mnexium/n8n-nodes-mnexium/issues)
