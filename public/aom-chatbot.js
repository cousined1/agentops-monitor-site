/**
 * AgentOps Monitor · Floating Sales Chatbot Widget
 * Embeddable floating salesbot for agentopsmonitor.com
 * Adapted from the ace-regulatory ace-chatbot.js pattern.
 * Usage: <script src="/aom-chatbot.js" async></script>
 *
 * Zero-dependency: no build step, no backend required. Lead capture posts to
 * CONFIG.apiEndpoint (optional). Works standalone on a static site.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------
  const CONFIG = {
    position: 'bottom-right',
    primaryColor: '#0f766e',        // teal: agent/monitor feel
    secondaryColor: '#115e59',
    accentColor: '#f59e0b',         // amber highlight (cost/budget warning)
    botName: 'AgentOps Assistant',
    botAvatar: '📡',
    companyName: 'AgentOps Monitor',
    siteUrl: 'https://agentopsmonitor.com',
    welcomeMessage:
      "👋 Hi! I'm the AgentOps Monitor assistant. I can help you understand how we track AI-agent costs and tool calls, walk through a trace, or get you started with the SDK.",
    apiEndpoint: '/api/leads',
    showOnLoad: true,
    delayBeforeOpen: 2500,
    storageKey: 'aom-chatbot-state',
    leadStorageKey: 'aom-chatbot-lead',
  };

  // ------------------------------------------------------------------
  // Sales flows (grounded in the real site copy + pricing)
  // ------------------------------------------------------------------
  const SALES_FLOWS = {
    welcome: {
      message:
        '👋 Welcome to AgentOps Monitor! I can help you:\n\n' +
        '• 📡 Learn what AgentOps Monitor does\n' +
        '• 💰 Pricing and plans\n' +
        '• 🔍 Replay an example agent trace\n' +
        '• ⚠️ Understand the "four hundred dollar call" problem\n' +
        '• 🛠️ How to send your first trace',
      quickReplies: [
        { text: 'What is AgentOps Monitor?', next: 'about' },
        { text: 'See pricing', next: 'pricing' },
        { text: 'Show me a trace', next: 'trace' },
        { text: 'Send your first trace', next: 'install' },
      ],
    },
    about: {
      message:
        '📡 **AgentOps Monitor** is observability for AI agents in production. It replays every tool call, every LLM decision, and every dollar an agent spends, so an on-call engineer at 2 a.m. can stop guessing and start fixing.\n\n' +
        '**The pitch:** *"Find the call that cost you four hundred dollars."*\n\n' +
        'It tracks: cost per run, token counts (in/out), every LLM call, and every tool call (Stripe, Slack, vectorstore, etc.).',
      quickReplies: [
        { text: 'The four hundred dollar problem', next: 'fourhundred' },
        { text: 'Four pains', next: 'pains' },
        { text: 'Show me a trace', next: 'trace' },
        { text: 'Pricing', next: 'pricing' },
      ],
    },
    fourhundred: {
      message:
        '💸 An agent with no budget is an incident waiting to be invoiced.\n\n' +
        'Example: a refund-triage agent (`refund-triage-v3`) hit a run where **one span ran hot**: 412,880 tokens, $18.44, a held Stripe refund, 3 retries, then **budget exceeded**. Three minutes of looping, and on-call saw the bill before they saw the fix.\n\n' +
        'AgentOps Monitor catches that: you see the exact call that cost you, and you see it before the invoice arrives.',
      quickReplies: [
        { text: 'Show me the trace', next: 'trace' },
        { text: 'Four pains', next: 'pains' },
        { text: 'Budgets & caps', next: 'budgets' },
      ],
    },
    pains: {
      message:
        '👀 **The four pains we solve, in a buyer\u2019s words:**\n\n' +
        '1. **You cannot see what it did.** Did it hallucinate, call the wrong API, retry forever?\n' +
        '2. **You cannot explain a decision.** Why was that refund rejected, that lead routed there?\n' +
        '3. **Costs spiral without a ceiling.** One looping agent, one very large bill.\n' +
        '4. **Compliance blocks the deploy.** No audit trail, no approval, no launch.\n\n' +
        'We turn every run into a replayable trace, with the cost of every call attached.',
      quickReplies: [
        { text: 'How do budget caps work?', next: 'budgets' },
        { text: 'Pricing', next: 'pricing' },
        { text: 'Send your first trace', next: 'install' },
      ],
    },
    trace: {
      message:
        '🔍 **Example trace · run `r_9f2c1a4e`**\n\n' +
        'Agent: `refund-triage-v3` · **Budget exceeded**\n' +
        '• Duration: 48,219 ms · 412 spans\n' +
        '• Cost: **$18.44** · Tokens: 412,880 in / 88,104 out\n\n' +
        '**Timeline:**\n' +
        '• +0 ms · `refund-triage-v3` start\n' +
        '• +12 ms · `llm` openai.chat · 8,204 tok\n' +
        '• +612 ms · `tool` vectorstore.query\n' +
        '• +820 ms · `tool` stripe.refunds.create · **HELD**\n' +
        '• +5,402 ms · `tool` retries × 3\n' +
        '• +11,008 ms · `llm` openai.chat · 64,118 tok\n' +
        '• +18,402 ms · `tool` slack.postMessage\n' +
        '• +48,219 ms · **end · failed**\n\n' +
        'Click a span to see the prompt, the model output, and what it changed in the world. The product did not stop this run for cost - it recorded all of it, which is the point: you can see the $400 before the invoice does.',
      quickReplies: [
        { text: 'How do caps stop this?', next: 'budgets' },
        { text: 'Pricing', next: 'pricing' },
        { text: 'Send your first trace', next: 'install' },
      ],
    },
    budgets: {
      message:
        '🛑 **Spend you can defend in a budget meeting.**\n\n' +
        'Every run and span records the input and output tokens and the cost your client reports at ingest, so the spend is visible on the run detail view instead of surfacing on an invoice.\n\n' +
        '**Today:** cost and token capture, per run and per span. No run is ever stopped for cost. The one limit enforced is the free tier at 10,000 runs per month.\n\n' +
        '**Planned:** a per-run cost cap. If a run would exceed it, the run is still recorded and marked as killed rather than discarded, because the overspending run is the evidence you need. Per-agent and per-user budgets are not planned.',
      quickReplies: [
        { text: 'Pricing', next: 'pricing' },
        { text: 'Send your first trace', next: 'install' },
        { text: 'What plans?', next: 'pricing' },
      ],
    },
    install: {
      message:
        '🛠️ **Send your first trace · one endpoint.**\n\n' +
        'There is no SDK to install yet. Ingestion is a single authenticated HTTPS endpoint.\n\n' +
        '```\nPOST https://agentopsmonitor.com/api/ingest\nAuthorization: Bearer aom_live_...\nContent-Type: application/json\n```\n\n' +
        'Any client that can POST JSON with a bearer token works — Python, TypeScript, Go, anything. Create a key under Account → API keys.\n\n' +
        'Planned: framework adapters for **LangChain**, **CrewAI**, and the **OpenAI SDK**.',
      quickReplies: [
        { text: 'Pricing', next: 'pricing' },
        { text: 'What plans?', next: 'pricing' },
        { text: 'Talk to sales', next: 'contact' },
      ],
    },
    pricing: {
      message:
        '💰 **Planned launch pricing:**\n\n' +
        '**Free · $0/mo**\n• Basic tracing\n• Community support\n\n' +
        '**Team · $299/mo**\n• Cost and token capture per run and span\n• Slack support\n\n' +
        '**Enterprise · from $2,000/mo**\n• Named support\n\n' +
        '**The free tier is capped; paid tiers are not.** The free plan stops at 10,000 runs per month and ingest returns 402 after that. Team and Enterprise are not capped and no overage is charged, so treat the 500,000 figure as intent rather than a limit in force.\n\n' +
        '*(See the pricing page for the published tier breakdown.)*',
      quickReplies: [
        { text: 'Compare plans', next: 'compare' },
        { text: 'Audit trail', next: 'audit' },
        { text: 'Talk to sales', next: 'contact' },
      ],
    },
    compare: {
      message:
        '📊 **Planned tiers:**\n\n' +
        '| Plan | Free | Team | Enterprise |\n' +
        '|---|---|---|---|\n' +
        '| Price | $0 | $299 | from $2,000 |\n' +
        '| Tracing | Basic | Full | Full |\n' +
        '| Cost & token capture | ✅ | ✅ | ✅ |\n' +
        '| Per-run cost cap | Planned | Planned | Planned |\n' +
        '| Support | Community | Slack | Named |\n\n' +
        '**Not enforced yet.** Metering, cost alerts, SSO, and audit export are not shipped, so no paid tier stops, bills, or restricts anything. There is also no self-service export today. The one limit that is enforced is the free tier: 10,000 runs per month, after which ingest returns 402 until the month rolls over or the account upgrades.',
      quickReplies: [
        { text: 'Send your first trace', next: 'install' },
        { text: 'Audit trail', next: 'audit' },
        { text: 'Talk to sales', next: 'contact' },
      ],
    },
    audit: {
      message:
        '📋 **What an audit reader actually gets:**\n\n' +
        '• **Run** · agent name, status, timing, tokens, cost\n' +
        '• **Span** · type, provider, model, tool name, status, duration, tokens, cost\n' +
        '• **Prompt and model output** · stored in full and shown on the run detail view\n' +
        '• **Tool call** · arguments, response, and latency\n\n' +
        '**Retention:** run and span data is kept indefinitely. There is no automated retention window yet, and payload data is stored unencrypted. You can erase everything for your account with a signed-in `DELETE /api/account` request.\n\n' +
        'Human approval workflows and policy blocks are not shipped. SOC 2 / HIPAA / GDPR / ISO badges are not claimed on the page.',
      quickReplies: [
        { text: 'Pricing', next: 'pricing' },
        { text: 'Talk to sales', next: 'contact' },
      ],
    },
    contact: {
      message:
        '📞 **Talk to AgentOps Monitor sales.**\n\n' +
        'Leave your work email and we\u2019ll reach out, right here.\n\n' +
        'Prefer email? Write to us at [support@agentopsmonitor.com](mailto:support@agentopsmonitor.com).\n\n' +
        'If you\u2019re an **Enterprise / regulated-industry** prospect, we\u2019ll set up a discovery call rather than self-serve.',
      quickReplies: [{ text: 'Leave my email', next: 'capture_lead' }],
      captureLead: true,
    },
    capture_lead: {
      message:
        '✅ **Lead capture.**\n\n' +
        'Please share your **work email** (and company, optional). Our team will follow up within 24 hours.',
      quickReplies: [{ text: 'Just browsing', next: 'browse' }],
      captureLead: true,
    },
    lead_company: {
      message:
        '📧 Got it: **{{email}}**.\n\n' +
        'What\u2019s your company name? (Optional - type *skip* if you\u2019d rather not say.)',
      quickReplies: [{ text: 'Skip', next: 'lead_confirm' }],
      captureLead: true,
    },
    lead_confirm: { message: '', captureLead: false },
    browse: {
      message:
        '👍 No problem, explore AgentOps Monitor.\n\n' +
        '• 🏠 [Homepage](https://agentopsmonitor.com)\n' +
        '• 🛠️ [Send your first trace](https://agentopsmonitor.com/#install)\n\n' +
        'I\u2019ll be here if you have questions. Just reopen the chat!',
      quickReplies: [
        { text: 'What is AgentOps Monitor?', next: 'about' },
        { text: 'Pricing', next: 'pricing' },
      ],
    },
    fallback: {
      message:
        'I can help you with:\n\n' +
        '• 📡 What AgentOps Monitor does\n' +
        '• 💰 Pricing and plans\n' +
        '• 🔍 Replaying an example trace\n' +
        '• 🛠️ Installing the SDK\n\n' +
        'What would you like to explore?',
      quickReplies: [
        { text: 'About', next: 'about' },
        { text: 'Pricing', next: 'pricing' },
        { text: 'Show a trace', next: 'trace' },
      ],
    },
  };

  // Keyword detection for free-form messages
  const KEYWORDS = {
    hello: ['hello', 'hi', 'hey', 'greetings', 'howdy'],
    install: [
      'install', 'sdk', 'integrate', 'langchain', 'crewai', 'openai', 'setup',
      'code', 'pip',
    ],
    audit: ['audit', 'compliance', 'soc2', 'soc 2', 'hipaa', 'gdpr', 'iso', 'trail'],
    price: [
      'price', 'cost', 'how much', 'pricing', 'plan', 'subscription', 'pay',
      'expensive', 'cheap', 'free tier', 'team plan', 'enterprise', 'overage',
    ],
    contact: [
      'contact', 'sales', 'speak', 'talk to', 'human', 'representative',
      'call me', 'email me', 'reach you', 'book a demo',
    ],
    budgets: [
      'budget', 'cap', 'limit', 'spend', 'ceiling', 'guardrail',
      'policy', 'retry', 'approval',
    ],
    demo: [
      'demo', 'show me', 'see it', 'walkthrough', 'trace', 'replay', 'example',
    ],
    about: [
      'about', 'what is', 'how does', 'features', 'what can', 'product',
      'monitor', 'observability', 'track',
    ],
  };

  function detectIntent(message) {
    const lower = message.toLowerCase();
    for (const [intent, words] of Object.entries(KEYWORDS)) {
      if (words.some((w) => lower.includes(w))) return intent;
    }
    return 'fallback';
  }

  // State
  let state = { isOpen: false, dismissed: false, messages: [], currentFlow: null, awaitingInput: false, leadData: {} };

  // DOM refs
  let widget, chatButton, chatWindow, messagesContainer, inputField;

  function createWidget() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes aom-slide-up { from { opacity:0; transform:translateY(20px);} to { opacity:1; transform:translateY(0);} }
      @keyframes aom-fade-in { from { opacity:0;} to { opacity:1;} }
      @keyframes aom-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(15,118,110,.4);} 50% { box-shadow:0 0 0 12px rgba(15,118,110,0);} }
      @keyframes aom-typing { 0%,100% { opacity:.3; transform:translateY(0);} 50% { opacity:1; transform:translateY(-4px);} }

      #aom-chatbot-widget {
        --aom-primary:${CONFIG.primaryColor};
        --aom-secondary:${CONFIG.secondaryColor};
        --aom-bg:#ffffff;
        --aom-text:#1f2937;
        --aom-muted:#6b7280;
        --aom-border:#e5e7eb;
        --aom-radius:16px;
        --aom-shadow:0 20px 60px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        position:fixed; z-index:999999; bottom:20px; right:20px;
      }
      #aom-chatbot-button {
        width:60px; height:60px; border-radius:50%;
        background:linear-gradient(135deg,var(--aom-primary),var(--aom-secondary));
        border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 20px rgba(15,118,110,.3);
        transition:transform .2s,box-shadow .2s; animation:aom-pulse 2s infinite; position:relative;
      }
      #aom-chatbot-button:hover { transform:scale(1.05); box-shadow:0 6px 30px rgba(15,118,110,.4); }
      #aom-chatbot-button svg { width:28px; height:28px; fill:#fff; }
      #aom-chatbot-close { display:none; position:absolute; top:-4px; right:-4px; width:20px; height:20px;
        background:#ef4444; border-radius:50%; color:#fff; font-size:12px; align-items:center; justify-content:center;
        cursor:pointer; border:2px solid #fff; }
      #aom-chatbot-widget.open #aom-chatbot-close { display:flex; }

      #aom-chatbot-window {
        position:absolute; bottom:76px; right:0; width:380px; max-height:600px; height:520px;
        background:var(--aom-bg); border-radius:var(--aom-radius); box-shadow:var(--aom-shadow);
        display:flex; flex-direction:column; overflow:hidden;
        opacity:0; transform:translateY(20px) scale(.95); pointer-events:none;
        transition:opacity .3s ease,transform .3s ease;
      }
      #aom-chatbot-widget.open #aom-chatbot-window { opacity:1; transform:translateY(0) scale(1); pointer-events:all; }

      #aom-chatbot-header {
        background:linear-gradient(135deg,var(--aom-primary),var(--aom-secondary));
        color:#fff; padding:16px 20px; display:flex; align-items:center; gap:12px;
      }
      #aom-chatbot-header-avatar { width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.2);
        display:flex; align-items:center; justify-content:center; font-size:20px; }
      #aom-chatbot-header-info h3 { margin:0; font-size:15px; font-weight:600; }
      #aom-chatbot-header-info p { margin:2px 0 0; font-size:12px; opacity:.9; }
      #aom-chatbot-header-close { margin-left:auto; background:none; border:none; color:#fff; cursor:pointer; padding:4px; opacity:.8; transition:opacity .2s; }
      #aom-chatbot-header-close:hover { opacity:1; }

      #aom-chatbot-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; }
      .aom-chatbot-message { display:flex; gap:8px; max-width:85%; animation:aom-fade-in .3s ease; }
      .aom-chatbot-message.bot { align-self:flex-start; }
      .aom-chatbot-message.user { align-self:flex-end; flex-direction:row-reverse; }
      .aom-chatbot-message-avatar { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
      .aom-chatbot-message.bot .aom-chatbot-message-avatar { background:linear-gradient(135deg,var(--aom-primary),var(--aom-secondary)); }
      .aom-chatbot-message.user .aom-chatbot-message-avatar { background:#e5e7eb; }
      .aom-chatbot-message-content { background:#f3f4f6; padding:12px 14px; border-radius:16px; font-size:13px; line-height:1.5; color:var(--aom-text); }
      .aom-chatbot-message.bot .aom-chatbot-message-content { border-bottom-left-radius:4px; }
      .aom-chatbot-message.user .aom-chatbot-message-content { background:linear-gradient(135deg,var(--aom-primary),var(--aom-secondary)); color:#fff; border-bottom-right-radius:4px; }
      .aom-chatbot-message-content strong { font-weight:600; }
      .aom-chatbot-message-content code { background:#e5e7eb; padding:1px 4px; border-radius:4px; font-size:12px; font-family:ui-monospace,Menlo,monospace; }
      .aom-chatbot-message.user .aom-chatbot-message-content code { background:rgba(0,0,0,.2); color:#fff; }
      .aom-chatbot-message-content a { color:var(--aom-primary); text-decoration:underline; }
      .aom-chatbot-message.user .aom-chatbot-message-content a { color:rgba(255,255,255,.9); }
      .aom-chatbot-message-content pre { background:#111827; color:#e5e7eb; padding:8px 10px; border-radius:8px; font-size:11px; overflow-x:auto; font-family:ui-monospace,Menlo,monospace; margin:6px 0; }
      .aom-chatbot-message-time { font-size:10px; color:var(--aom-muted); margin-top:4px; text-align:right; }

      .aom-chatbot-table { width:100%; border-collapse:collapse; margin:8px 0; font-size:11px; }
      .aom-chatbot-table th, .aom-chatbot-table td { padding:4px 6px; border:1px solid var(--aom-border); text-align:left; }
      .aom-chatbot-table th { background:#e5e7eb; font-weight:600; }

      .aom-chatbot-quick-replies { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
      .aom-chatbot-quick-reply { background:#fff; border:1px solid var(--aom-primary); color:var(--aom-primary);
        padding:6px 12px; border-radius:20px; font-size:12px; cursor:pointer; transition:all .2s; white-space:nowrap; }
      .aom-chatbot-quick-reply:hover { background:var(--aom-primary); color:#fff; }

      .aom-chatbot-typing { display:flex; gap:4px; padding:12px 16px; align-self:flex-start; }
      .aom-chatbot-typing-dot { width:8px; height:8px; background:var(--aom-muted); border-radius:50%; animation:aom-typing 1.4s infinite; }
      .aom-chatbot-typing-dot:nth-child(2){ animation-delay:.2s; }
      .aom-chatbot-typing-dot:nth-child(3){ animation-delay:.4s; }

      #aom-chatbot-input-area { padding:12px 16px; border-top:1px solid var(--aom-border); display:flex; gap:8px; align-items:center; }
      #aom-chatbot-input { flex:1; border:1px solid var(--aom-border); border-radius:24px; padding:10px 16px; font-size:13px; outline:none; transition:border-color .2s; }
      #aom-chatbot-input:focus { border-color:var(--aom-primary); }
      #aom-chatbot-send { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,var(--aom-primary),var(--aom-secondary));
        border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform .2s; }
      #aom-chatbot-send:hover { transform:scale(1.05); }
      #aom-chatbot-send svg { width:18px; height:18px; fill:#fff; }

      .aom-chatbot-powered { text-align:center; font-size:10px; color:var(--aom-muted); padding:4px; border-top:1px solid var(--aom-border); }
      .aom-chatbot-powered a { color:var(--aom-primary); text-decoration:none; }
      #aom-chatbot-messages::-webkit-scrollbar { width:6px; }
      #aom-chatbot-messages::-webkit-scrollbar-track { background:transparent; }
      #aom-chatbot-messages::-webkit-scrollbar-thumb { background:#d1d5db; border-radius:3px; }
      @media (max-width:480px) {
        #aom-chatbot-widget { bottom:10px; right:10px; }
        #aom-chatbot-window { width:calc(100vw - 20px); height:calc(100vh - 100px); max-height:none; right:0; }
      }
    `;
    document.head.appendChild(style);

    widget = document.createElement('div');
    widget.id = 'aom-chatbot-widget';

    chatButton = document.createElement('button');
    chatButton.id = 'aom-chatbot-button';
    chatButton.setAttribute('aria-label', 'Open support chat');
    chatButton.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>' +
      '<span id="aom-chatbot-close">×</span>';
    chatButton.addEventListener('click', toggleChat);

    chatWindow = document.createElement('div');
    chatWindow.id = 'aom-chatbot-window';
    chatWindow.innerHTML =
      '<div id="aom-chatbot-header">' +
      '<div id="aom-chatbot-header-avatar">' + CONFIG.botAvatar + '</div>' +
      '<div id="aom-chatbot-header-info"><h3>' + CONFIG.botName + '</h3><p>Online · ' + CONFIG.companyName + '</p></div>' +
      '<button id="aom-chatbot-header-close" aria-label="Close chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '</div>' +
      '<div id="aom-chatbot-messages"></div>' +
      '<div id="aom-chatbot-input-area">' +
      '<input type="text" id="aom-chatbot-input" placeholder="Type a message..." aria-label="Message support" autocomplete="off">' +
      '<button id="aom-chatbot-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
      '</div>' +
      '<div class="aom-chatbot-powered">Powered by <a href="' + CONFIG.siteUrl + '" target="_blank" rel="noopener">' + CONFIG.companyName + '</a></div>';

    widget.appendChild(chatButton);
    widget.appendChild(chatWindow);
    document.body.appendChild(widget);

    messagesContainer = document.getElementById('aom-chatbot-messages');
    inputField = document.getElementById('aom-chatbot-input');

    document.getElementById('aom-chatbot-header-close').addEventListener('click', closeChat);
    document.getElementById('aom-chatbot-send').addEventListener('click', sendMessage);
    inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    loadState();
  }

  function toggleChat() {
    if (state.isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }
  function openChat() {
    widget.classList.add('open');
    state.isOpen = true;
    state.dismissed = false;
    saveState();
    if (!messagesContainer.querySelector('.aom-chatbot-message')) showBotMessage('welcome');
  }
  function closeChat() {
    widget.classList.remove('open');
    state.isOpen = false;
    state.dismissed = true;
    saveState();
  }

  function showBotMessage(flowKey) {
    if (flowKey === 'lead_confirm') { state.awaitingInput = false; showLeadConfirmation().catch(() => {}); return; }
    const flow = SALES_FLOWS[flowKey] || SALES_FLOWS.fallback;
    state.currentFlow = flowKey;
    const bodyText = (flow.message || flow.intro || '').replace(/\{\{email\}\}/g, state.leadData.email || 'your email');
    showTyping();
    setTimeout(() => {
      hideTyping();
      const messageDiv = document.createElement('div');
      messageDiv.className = 'aom-chatbot-message bot';
      messageDiv.innerHTML =
        '<div class="aom-chatbot-message-avatar">' + CONFIG.botAvatar + '</div>' +
        '<div>' +
        '<div class="aom-chatbot-message-content">' + formatMessage(bodyText) + '</div>' +
        (flow.quickReplies
          ? '<div class="aom-chatbot-quick-replies">' +
            flow.quickReplies.map((r) => '<button class="aom-chatbot-quick-reply" data-next="' + r.next + '">' + r.text + '</button>').join('') +
            '</div>'
          : '') +
        '<div class="aom-chatbot-message-time">' + getTimeString() + '</div>' +
        '</div>';
      messagesContainer.appendChild(messageDiv);
      scrollToBottom();
      messageDiv.querySelectorAll('.aom-chatbot-quick-reply').forEach((btn) => {
        btn.addEventListener('click', () => {
          addUserMessage(btn.textContent);
          setTimeout(() => showBotMessage(btn.dataset.next), 500);
        });
      });
      state.awaitingInput = flow.captureLead || false;
      if (typeof gtag !== 'undefined') gtag('event', 'chatbot_flow', { flow: flowKey });
    }, 700 + Math.random() * 300);
  }

  function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'aom-chatbot-message user';
    messageDiv.innerHTML =
      '<div class="aom-chatbot-message-avatar">👤</div>' +
      '<div><div class="aom-chatbot-message-content">' + escapeHtml(text) + '</div>' +
      '<div class="aom-chatbot-message-time">' + getTimeString() + '</div></div>';
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    state.messages.push({ role: 'user', text, time: Date.now() });
    saveState();
  }

  function sendMessage() {
    const text = inputField.value.trim();
    if (!text) return;
    inputField.value = '';
    addUserMessage(text);
    if (state.awaitingInput) { handleLeadCapture(text); return; }
    const intent = detectIntent(text);
    setTimeout(() => showBotMessage(intent), 600);
  }

  function handleLeadCapture(text) {
    const trimmed = (text || '').trim();
    const emailMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!state.leadData.email) {
      if (emailMatch) {
        state.leadData.email = emailMatch[0];
        showBotMessage('lead_company');
      } else {
        showBotMessage('capture_lead');
      }
      return;
    }
    const isSkip = /^(skip|no|none|n\/a|later)$/i.test(trimmed);
    if (!state.leadData.company && !isSkip && !trimmed.includes('@') && trimmed.length > 1) {
      state.leadData.company = trimmed;
    }
    showLeadConfirmation().catch(() => {});
  }

  async function showLeadConfirmation() {
    // AUDIT-RUN-20260930-202741 (FINDING-api-surface-001): the server now
    // persists leads and returns 503 if it could not store one. This function
    // used to render 'we captured your details, we'll be in touch in 24 hours'
    // immediately and fire the POST in the background with errors swallowed —
    // so the promise was made before, and regardless of, whether anything was
    // stored. It is now async: we POST first, then tell the visitor the truth.
    let stored = !CONFIG.apiEndpoint;
    if (CONFIG.apiEndpoint) {
      try {
        const res = await fetch(CONFIG.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: state.leadData.email,
            company: state.leadData.company,
            source: 'agentopsmonitor-chatbot',
            product: 'agentops_monitor',
            timestamp: new Date().toISOString(),
            conversation: state.messages,
          }),
        });
        stored = res.ok;
      } catch {
        stored = false;
      }
    }

    const flow = stored
      ? {
        message:
          '✅ **Thank you!**\n\nI\u2019ve captured your details:\n' +
          '• 📧 Email: ' + (state.leadData.email || 'Not provided') + '\n' +
          '• 🏢 Company: ' + (state.leadData.company || 'Not provided') + '\n\n' +
          'Our team will reach out within 24 hours. In the meantime:\n\n' +
          '• 📧 [support@agentopsmonitor.com](mailto:support@agentopsmonitor.com)\n' +
          '• 🛠️ [Send your first trace](https://agentopsmonitor.com/#install)\n' +
          '• 💰 [See pricing](https://agentopsmonitor.com/#pricing)',
        quickReplies: [
          { text: 'Send your first trace', next: 'install' },
          { text: 'Pricing', next: 'pricing' },
          { text: 'Thanks, I\u2019m good', next: 'browse' },
        ],
      }
      : {
        message:
          '⚠️ **I could not save your details** — our store is briefly unavailable, so I don\u2019t want to tell you we have them when we don\u2019t.\n\n' +
          'Please try again in a moment, or email us directly:\n\n' +
          '• 📧 [support@agentopsmonitor.com](mailto:support@agentopsmonitor.com)',
        quickReplies: [
          { text: 'Try again', next: 'capture_lead' },
          { text: 'Pricing', next: 'pricing' },
          { text: 'Thanks, I\u2019m good', next: 'browse' },
        ],
      };
    state.awaitingInput = false;
    if (functionalConsent()) {
      try { localStorage.setItem(CONFIG.leadStorageKey, JSON.stringify(state.leadData)); } catch {}
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'aom-chatbot-message bot';
    messageDiv.innerHTML =
      '<div class="aom-chatbot-message-avatar">' + CONFIG.botAvatar + '</div>' +
      '<div><div class="aom-chatbot-message-content">' + formatMessage(flow.message) + '</div>' +
      '<div class="aom-chatbot-quick-replies">' +
      flow.quickReplies.map((r) => '<button class="aom-chatbot-quick-reply" data-next="' + r.next + '">' + r.text + '</button>').join('') +
      '</div><div class="aom-chatbot-message-time">' + getTimeString() + '</div></div>';
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    messageDiv.querySelectorAll('.aom-chatbot-quick-reply').forEach((btn) => {
      btn.addEventListener('click', () => { addUserMessage(btn.textContent); setTimeout(() => showBotMessage(btn.dataset.next), 500); });
    });
  }

  function showTyping() {
    hideTyping();
    const typingDiv = document.createElement('div');
    typingDiv.id = 'aom-chatbot-typing';
    typingDiv.className = 'aom-chatbot-typing';
    typingDiv.innerHTML = '<div class="aom-chatbot-typing-dot"></div><div class="aom-chatbot-typing-dot"></div><div class="aom-chatbot-typing-dot"></div>';
    messagesContainer.appendChild(typingDiv);
    scrollToBottom();
  }
  function hideTyping() { const t = document.getElementById('aom-chatbot-typing'); if (t) t.remove(); }
  function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

  function formatMessage(text) {
    const codeBlocks = [];
    let processed = escapeHtml(text || '')
      .replace(/```([\s\S]*?)```/g, (_, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`<pre>${code.trim()}</pre>`);
        return `__CODE_BLOCK_${idx}__`;
      })
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Parse markdown tables if present
    processed = processed.replace(/(?:^|\n)(\|.+?\|\n\|[-: |]+\|\n(?:\|.+?\|\n?)+)/g, (match) => {
      const rows = match.trim().split('\n').map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      if (rows.length < 2) return match;
      const header = rows[0];
      const dataRows = rows.slice(2);
      const ths = header.map(h => `<th>${h}</th>`).join('');
      const trs = dataRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
      return `<table class="aom-chatbot-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    });

    processed = processed.replace(/\n/g, '<br>');

    codeBlocks.forEach((block, idx) => {
      processed = processed.replace(`__CODE_BLOCK_${idx}__`, block);
    });

    return processed;
  }

  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
  function getTimeString() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  // Cookie consent detection across both GTM-aware and standalone models
  function functionalConsent() {
    if (window.__aomConsent) {
      return !!(window.__aomConsent.functional || window.__aomConsent.preferences);
    }
    try {
      const raw = localStorage.getItem('aom_cookie_consent') || localStorage.getItem('aom-cookie-consent');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const cats = parsed.categories || parsed;
      return !!(cats.preferences || cats.functional);
    } catch {
      return false;
    }
  }

  function loadSavedLeadData() {
    if (!functionalConsent()) return;
    try {
      const savedLead = localStorage.getItem(CONFIG.leadStorageKey);
      if (savedLead) {
        const parsed = JSON.parse(savedLead);
        if (parsed && typeof parsed === 'object') {
          state.leadData = Object.assign(state.leadData, parsed);
        }
      }
    } catch {}
  }

  function saveState() {
    if (!functionalConsent()) return;
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        isOpen: state.isOpen,
        dismissed: !!state.dismissed,
      }));
    } catch {}
  }

  function loadState() {
    state.messages = [];
    if (functionalConsent()) {
      loadSavedLeadData();
      try {
        const savedState = localStorage.getItem(CONFIG.storageKey);
        if (savedState) {
          const parsed = JSON.parse(savedState);
          if (parsed && typeof parsed === 'object') {
            if (parsed.dismissed) {
              state.dismissed = true;
            }
            if (parsed.isOpen) {
              state.isOpen = true;
              if (widget) widget.classList.add('open');
            }
          }
        }
      } catch {}
    }
  }

  function onConsentChange(e) {
    const detail = e.detail;
    const cats = detail?.categories || detail || {};
    const allowed = !!(cats.preferences || cats.functional);
    if (allowed) {
      loadSavedLeadData();
    } else {
      state.leadData = {};
      try {
        localStorage.removeItem(CONFIG.storageKey);
        localStorage.removeItem(CONFIG.leadStorageKey);
      } catch {}
    }
  }

  window.addEventListener('aom:consent-updated', onConsentChange);
  document.addEventListener('aom:consent', onConsentChange);

  let initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    createWidget();
    if (CONFIG.showOnLoad && !state.isOpen && !state.dismissed) {
      setTimeout(() => {
        if (!state.isOpen && !state.dismissed) openChat();
      }, CONFIG.delayBeforeOpen);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.AOMChatbot = {
    open: openChat,
    close: closeChat,
    toggle: toggleChat,
    sendMessage: (text) => { openChat(); addUserMessage(text); setTimeout(() => showBotMessage(detectIntent(text)), 600); },
    setConfig: (newConfig) => Object.assign(CONFIG, newConfig),
  };
})();
