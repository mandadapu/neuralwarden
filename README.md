# AI NeuralWarden Pipeline

A multi-agent security log analysis pipeline using **LangGraph** + **Anthropic Claude** with multi-model routing for cost-optimized threat detection and incident reporting.

## Architecture

```
Raw Logs → [Ingest Agent] → [Detect Agent] → [Classify Agent] → [Report Agent] → Incident Report
             Haiku 4.5       Sonnet 4.5       Sonnet 4.5         Opus 4.6
             $0.25/MTok      $3.00/MTok       $3.00/MTok         $15.00/MTok
```

**4 Specialized Agents:**
- **Ingest** (Haiku 4.5) — Parses raw security logs into structured entries
- **Detect** (Sonnet 4.5) — Finds threats via rule-based patterns + AI detection
- **Classify** (Sonnet 4.5) — Risk-scores threats with MITRE ATT&CK mappings
- **Report** (Opus 4.6) — Generates dual-audience incident reports with action plans

**Conditional Routing** — Skips unnecessary agents to save API costs:
- No valid logs → skip all downstream agents
- No threats found → skip classification and reporting

## Setup

```bash
# Clone and create venv
python3.13 -m venv .venv
source .venv/bin/activate

# Install
pip install -e ".[dev]"

# Configure
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

## Usage

### CLI
```bash
python main.py sample_logs/brute_force.txt
python main.py sample_logs/mixed_threats.txt
python main.py sample_logs/clean_logs.txt
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
├── main.py                    # CLI entry point
├── app.py                     # Gradio dashboard
├── pipeline/
│   ├── state.py               # PipelineState TypedDict
│   ├── graph.py               # LangGraph StateGraph
│   └── agents/
│       ├── ingest.py          # Haiku 4.5
│       ├── detect.py          # Sonnet 4.5
│       ├── classify.py        # Sonnet 4.5
│       └── report.py          # Opus 4.6
├── rules/
│   └── detection.py           # Rule-based detection patterns
├── models/
│   ├── log_entry.py
│   ├── threat.py
│   └── incident_report.py
├── sample_logs/
└── tests/
```
