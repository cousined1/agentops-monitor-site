# AgentOps Monitor Site

Pre-launch concept site for an AI-agent observability product. The current brand name is provisional because `AgentOps.ai` already operates in this category.

## Run locally

```powershell
npm start
```

Open `http://localhost:3000`. Health metadata is available at `http://localhost:3000/api/health`.

Private source: https://github.com/cousined1/agentops-monitor-site

Live preview: https://agentops-monitor-site-production.up.railway.app

## Evidence

- `product-facts.md` records verified, owner-supplied, cut, and unverified claims.
- `SITE_SPEC.md` records the design and honesty constraints.
- `JUDGE.md` compares the three visual directions and names the winner.
- `RUN.json` records validation, visual, and deployment status.
- `shots/` is generated locally by the Site Forge screenshot harness and is not committed.
- `variants/` contains the three compared directions.

## Validation

The shipped root page passes both Site Forge validators with zero errors and zero warnings. The screenshot harness reports no console errors, failed requests, or horizontal overflow at 1440px and 393px.
