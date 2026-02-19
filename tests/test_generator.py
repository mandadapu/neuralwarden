"""Tests for the Mock Attack Generator."""

import re
from datetime import datetime

from scripts.attack_generator import AttackGenerator


class TestListScenarios:
    def test_returns_all_four_scenarios(self):
        scenarios = AttackGenerator.list_scenarios()
        assert len(scenarios) == 4

    def test_each_scenario_has_required_keys(self):
        for s in AttackGenerator.list_scenarios():
            assert "id" in s
            assert "name" in s
            assert "description" in s

    def test_scenario_ids(self):
        ids = {s["id"] for s in AttackGenerator.list_scenarios()}
        assert ids == {"apt_intrusion", "insider_threat", "ransomware", "cryptominer"}


class TestGenerateCount:
    """Each scenario produces the exact requested number of logs."""

    def test_apt_intrusion_default_count(self):
        gen = AttackGenerator()
        logs = gen.generate("apt_intrusion")
        assert len(logs) == 50

    def test_insider_threat_custom_count(self):
        gen = AttackGenerator()
        logs = gen.generate("insider_threat", log_count=100)
        assert len(logs) == 100

    def test_ransomware_custom_count(self):
        gen = AttackGenerator()
        logs = gen.generate("ransomware", log_count=30)
        assert len(logs) == 30

    def test_cryptominer_custom_count(self):
        gen = AttackGenerator()
        logs = gen.generate("cryptominer", log_count=75)
        assert len(logs) == 75

    def test_high_count(self):
        gen = AttackGenerator()
        logs = gen.generate("apt_intrusion", log_count=200)
        assert len(logs) == 200


class TestAttackPatterns:
    """Scenario-specific attack signatures appear in the output."""

    def test_apt_has_failed_password(self):
        gen = AttackGenerator()
        logs = gen.generate("apt_intrusion", log_count=50, noise_ratio=0.0)
        text = "\n".join(logs)
        assert "Failed password" in text

    def test_insider_has_scp(self):
        gen = AttackGenerator()
        logs = gen.generate("insider_threat", log_count=50, noise_ratio=0.0)
        text = "\n".join(logs)
        assert "scp" in text.lower()

    def test_ransomware_has_encrypt(self):
        gen = AttackGenerator()
        logs = gen.generate("ransomware", log_count=50, noise_ratio=0.0)
        text = "\n".join(logs)
        assert "encrypt" in text.lower()

    def test_cryptominer_has_mining_pool(self):
        gen = AttackGenerator()
        logs = gen.generate("cryptominer", log_count=50, noise_ratio=0.0)
        text = "\n".join(logs)
        assert "mining pool" in text.lower() or "mining" in text.lower()


class TestNoiseRatio:
    """Benign noise ratio roughly matches the requested fraction."""

    BENIGN_MARKERS = ["crond", "systemd", "yum", "UFW ALLOW", "healthz", "apt upgrade", "Accepted publickey"]

    def _benign_fraction(self, logs):
        benign = sum(
            1 for line in logs
            if any(m in line for m in self.BENIGN_MARKERS)
        )
        return benign / len(logs)

    def test_zero_noise(self):
        gen = AttackGenerator()
        logs = gen.generate("apt_intrusion", log_count=100, noise_ratio=0.0)
        assert len(logs) == 100
        # With 0 noise every line should be attack
        benign = self._benign_fraction(logs)
        assert benign < 0.05  # tiny tolerance for overlap in templates

    def test_high_noise(self):
        gen = AttackGenerator()
        logs = gen.generate("apt_intrusion", log_count=200, noise_ratio=0.8)
        benign = self._benign_fraction(logs)
        # Should be roughly 80% benign; allow 15pp tolerance
        assert benign > 0.55, f"Expected >55% benign, got {benign:.0%}"

    def test_moderate_noise(self):
        gen = AttackGenerator()
        logs = gen.generate("ransomware", log_count=100, noise_ratio=0.6)
        benign = self._benign_fraction(logs)
        assert benign > 0.35, f"Expected >35% benign, got {benign:.0%}"


class TestTimestampOrder:
    """Log timestamps are sequential (non-decreasing)."""

    TS_RE = re.compile(r"^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})")

    def _parse_ts(self, line: str) -> datetime:
        m = self.TS_RE.match(line)
        assert m, f"No timestamp found in: {line!r}"
        return datetime.strptime(m.group(1), "%b %d %H:%M:%S")

    def test_apt_timestamps_sorted(self):
        gen = AttackGenerator()
        logs = gen.generate("apt_intrusion", log_count=80)
        timestamps = [self._parse_ts(l) for l in logs]
        for i in range(1, len(timestamps)):
            assert timestamps[i] >= timestamps[i - 1], (
                f"Timestamp out of order at line {i}: "
                f"{timestamps[i - 1]} > {timestamps[i]}"
            )

    def test_cryptominer_timestamps_sorted(self):
        gen = AttackGenerator()
        logs = gen.generate("cryptominer", log_count=60)
        timestamps = [self._parse_ts(l) for l in logs]
        for i in range(1, len(timestamps)):
            assert timestamps[i] >= timestamps[i - 1]


class TestInvalidScenario:
    def test_unknown_scenario_raises(self):
        gen = AttackGenerator()
        try:
            gen.generate("does_not_exist")
            assert False, "Expected ValueError"
        except ValueError as exc:
            assert "does_not_exist" in str(exc)
