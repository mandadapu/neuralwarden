# AI NeuralWarden Pipeline v2.0

A multi-agent security log analysis pipeline using **LangGraph** + **Anthropic Claude** with multi-model routing, shadow validation, RAG threat intelligence, and human-in-the-loop review.

## Architecture

```
START
  │
  [should_burst?] ─── >1000 logs ──→ ingest_chunk (x N parallel) → aggregate
  │                                                                    │
  ▼                                                                    ▼
[ingest] ──── valid logs? ──→ [detect] ──→ [validate] ──── threats? ──→ [classify + RAG]
  │ No                                                      │ No           │
  ▼                                                         ▼             [should_hitl?]
empty_report → END                                    clean_report → END  │          │
                                                                          ▼          ▼
                                                                    hitl_review   report → END
                                                                          │
                                                                       report → END
```

### 5 Specialized Agents + 1 Validator

| Agent | Model | Cost | Purpose |
|-------|-------|------|---------|
| **Ingest** | Haiku 4.5 | $0.25/MTok | Parse raw logs into structured entries |
| **Detect** | Sonnet 4.5 | $3.00/MTok | Rule-based + AI threat detection |
| **Validate** | Sonnet 4.5 | $3.00/MTok | Shadow-check 5% of "clean" logs |
| **Classify** | Sonnet 4.5 | $3.00/MTok | Risk-score threats + MITRE ATT&CK + RAG |
| **Report** | Opus 4.6 | $15.00/MTok | Dual-audience incident reports |

### v2.0 Enhancements

1. **Validator Agent** — Samples 5% of "clean" logs and checks for missed threats
2. **RAG Threat Intelligence** — Pinecone vector DB with CVE data enriches classification
3. **Human-in-the-Loop** — LangGraph `interrupt()` pauses for critical threats; Gradio approve/reject UI
4. **Burst Mode** — Parallel ingest via `Send` API for >1000 logs
5. **Agent Metrics** — Per-agent cost, latency, and token tracking

## Setup

```bash
# Clone and create venv
python3.13 -m venv .venv
source .venv/bin/activate

# Install
pip install -e ".[dev]"

# Configure
cp .env.example .env
# Add your API keys to .env:
#   ANTHROPIC_API_KEY  (required)
#   OPENAI_API_KEY     (for RAG embeddings)
#   PINECONE_API_KEY   (for RAG vector store)
```

### Seed Pinecone (optional, for RAG)

```bash
python scripts/seed_pinecone.py
```

## Usage

### CLI
```bash
python main.py sample_logs/brute_force.txt
python main.py sample_logs/mixed_threats.txt
python main.py sample_logs/clean_logs.txt

# With human-in-the-loop for critical threats
python main.py sample_logs/brute_force.txt --hitl
```

### Gradio Dashboard
```bash
python app.py
# Opens at http://localhost:7860
```

### Tests
```bash
pytest tests/ -v
```

## Sample Logs

| File | Scenario | Expected Threats |
|------|----------|-----------------|
| `brute_force.txt` | SSH brute force + privilege escalation | 2+ threats (critical/high) |
| `data_exfiltration.txt` | Large outbound transfers | 1+ data exfil threat |
| `mixed_threats.txt` | Port scan + brute force + lateral movement + exfil | 4+ threats |
| `clean_logs.txt` | Normal operations | 0 threats (short-circuit) |

## Project Structure

```
neuralwarden/
├── main.py                         # CLI entry point
├── app.py                          # Gradio dashboard with HITL
├── pipeline/
│   ├── state.py                    # PipelineState TypedDict
│   ├── graph.py                    # LangGraph StateGraph v2.0
│   ├── metrics.py                  # AgentTimer cost/latency tracking
│   ├── vector_store.py             # Pinecone RAG wrapper
│   └── agents/
│       ├── ingest.py               # Haiku 4.5
│       ├── ingest_chunk.py         # Burst mode chunk processor
│       ├── detect.py               # Sonnet 4.5
│       ├── validate.py             # Sonnet 4.5 (shadow validator)
│       ├── classify.py             # Sonnet 4.5 (+ RAG)
│       ├── hitl.py                 # Human-in-the-loop interrupt
│       └── report.py               # Opus 4.6
├── rules/
│   └── detection.py                # Rule-based detection patterns
├── models/
│   ├── log_entry.py
│   ├── threat.py
│   └── incident_report.py
├── data/
│   └── cve_seeds.json              # CVE data for Pinecone
├── scripts/
│   └── seed_pinecone.py            # Seed Pinecone index
├── sample_logs/
├── tests/                          # 49 tests
└── docs/
    └── API.md                      # Full API documentation
```
