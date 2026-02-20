"""Mock Attack Generator — produces realistic synthetic security logs.

Generates syslog-style log lines for four attack scenarios, mixed with
configurable benign noise.  No LLM required; all content is built from
string templates with randomization.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import ClassVar


class AttackGenerator:
    """Generate synthetic security logs for NeuralWarden testing."""

    USERNAMES: ClassVar[list[str]] = [
        "admin", "jsmith", "root", "svc_backup", "deploy", "analyst",
    ]
    HOSTNAMES: ClassVar[list[str]] = [
        "web-server", "db-master", "app-node1", "app-node2",
        "file-srv", "mail-gw", "bastion", "jump-host",
    ]
    SERVICES: ClassVar[list[str]] = [
        "sshd", "httpd", "mysqld", "crond", "systemd", "kernel",
    ]
    PORTS: ClassVar[list[int]] = [22, 80, 443, 3306, 8080, 8443]
    BENIGN_TEMPLATES: ClassVar[list[str]] = [
        "{ts} {host} crond[{pid}]: (root) CMD (/usr/lib64/sa/sa1 1 1)",
        "{ts} {host} systemd[1]: Started Session {sess} of user {user}.",
        "{ts} {host} sshd[{pid}]: Accepted publickey for {user} from {int_ip} port {port} ssh2",
        "{ts} {host} yum[{pid}]: Updated: openssl-1.1.1k-7.el8.x86_64",
        "{ts} {host} kernel: [UFW ALLOW] IN=eth0 OUT= SRC={int_ip} DST={int_ip2} PROTO=TCP SPT={port} DPT=443",
        "{ts} {host} systemd[1]: Starting Daily apt upgrade and target...",
        "{ts} {host} httpd[{pid}]: {int_ip} - - \"GET /healthz HTTP/1.1\" 200 2",
        "{ts} {host} crond[{pid}]: (svc_backup) CMD (/opt/backup/daily.sh)",
    ]

    # -- Scenario metadata ---------------------------------------------------

    _SCENARIOS: ClassVar[dict[str, dict]] = {
        "apt_intrusion": {
            "id": "apt_intrusion",
            "name": "APT Multi-Stage Intrusion",
            "description": (
                "Advanced Persistent Threat: recon port scanning, SSH brute "
                "force, successful auth, privilege escalation, lateral "
                "movement, and data exfiltration."
            ),
        },
        "insider_threat": {
            "id": "insider_threat",
            "name": "Insider Threat (Off-Hours)",
            "description": (
                "Insider abuse: normal daytime logins followed by large file "
                "access at 2 AM, data staging, and SCP exfiltration to an "
                "external IP."
            ),
        },
        "ransomware": {
            "id": "ransomware",
            "name": "Ransomware Attack",
            "description": (
                "Ransomware kill-chain: phishing email download, malware "
                "execution, lateral movement across multiple hosts, and mass "
                "file encryption."
            ),
        },
        "cryptominer": {
            "id": "cryptominer",
            "name": "Crypto Mining Infection",
            "description": (
                "Cryptojacking: compromised server, C2 beacon to mining pool, "
                "high CPU utilization, and unusual outbound connections."
            ),
        },
    }

    # -- Helpers --------------------------------------------------------------

    @classmethod
    def list_scenarios(cls) -> list[dict]:
        """Return metadata for every available scenario."""
        return list(cls._SCENARIOS.values())

    @staticmethod
    def _random_internal_ip() -> str:
        prefix = random.choice(["10.0", "192.168"])
        return f"{prefix}.{random.randint(1, 254)}.{random.randint(1, 254)}"

    @staticmethod
    def _random_external_ip() -> str:
        """Return a random public-looking IP, avoiding private/reserved."""
        first = random.choice([
            random.randint(1, 9),
            random.randint(11, 126),
            random.randint(128, 172),
            random.randint(174, 191),
            random.randint(193, 223),
        ])
        return (
            f"{first}.{random.randint(0, 255)}"
            f".{random.randint(0, 255)}.{random.randint(1, 254)}"
        )

    @staticmethod
    def _pid() -> int:
        return random.randint(1000, 65535)

    def _fmt_ts(self, dt: datetime) -> str:
        return dt.strftime("%b %d %H:%M:%S")

    def _advance(self, dt: datetime) -> datetime:
        return dt + timedelta(seconds=random.randint(1, 30))

    # -- Benign noise ---------------------------------------------------------

    def _benign_log(self, ts: datetime) -> str:
        tmpl = random.choice(self.BENIGN_TEMPLATES)
        return tmpl.format(
            ts=self._fmt_ts(ts),
            host=random.choice(self.HOSTNAMES),
            pid=self._pid(),
            user=random.choice(self.USERNAMES),
            int_ip=self._random_internal_ip(),
            int_ip2=self._random_internal_ip(),
            port=random.choice(self.PORTS),
            sess=random.randint(1, 9999),
        )

    # -- Scenario builders ----------------------------------------------------

    def _apt_intrusion(self, count: int, ts: datetime) -> list[str]:
        """APT multi-stage intrusion logs."""
        attacker = self._random_external_ip()
        target = self._random_internal_ip()
        target2 = self._random_internal_ip()
        user = random.choice(self.USERNAMES)
        host = random.choice(self.HOSTNAMES)
        host2 = random.choice(self.HOSTNAMES)
        logs: list[str] = []

        stages: list[list[str]] = [
            # Stage 1 — Recon / port scanning
            [
                "{ts} {host} kernel: [UFW BLOCK] IN=eth0 OUT= SRC={attacker} DST={target} PROTO=TCP SPT={rport} DPT={dport}",
                "{ts} {host} sshd[{pid}]: Connection from {attacker} port {rport} on {target} port 22",
                "{ts} {host} kernel: [UFW BLOCK] IN=eth0 OUT= SRC={attacker} DST={target} PROTO=TCP SPT={rport} DPT=3306",
            ],
            # Stage 2 — SSH brute force
            [
                "{ts} {host} sshd[{pid}]: Failed password for {user} from {attacker} port 22 ssh2",
                "{ts} {host} sshd[{pid}]: Failed password for {user} from {attacker} port 22 ssh2",
                "{ts} {host} sshd[{pid}]: Failed password for root from {attacker} port 22 ssh2",
                "{ts} {host} sshd[{pid}]: Failed password for admin from {attacker} port 22 ssh2",
            ],
            # Stage 3 — Successful auth
            [
                "{ts} {host} sshd[{pid}]: Accepted password for {user} from {attacker} port 22 ssh2",
            ],
            # Stage 4 — Privilege escalation
            [
                "{ts} {host} sudo[{pid}]: {user} : TTY=pts/0 ; PWD=/home/{user} ; USER=root ; COMMAND=/bin/bash",
                "{ts} {host} kernel: audit: type=1400 msg=audit(1): apparmor=\"DENIED\" operation=\"capable\" profile=\"/usr/sbin/sshd\" pid={pid} comm=\"bash\" capability=7",
            ],
            # Stage 5 — Lateral movement
            [
                "{ts} {host2} sshd[{pid}]: Accepted publickey for root from {target} port 22 ssh2",
                "{ts} {host2} sshd[{pid}]: pam_unix(sshd:session): session opened for user root by (uid=0)",
            ],
            # Stage 6 — Data exfiltration
            [
                "{ts} {host2} kernel: [UFW ALLOW] IN= OUT=eth0 SRC={target2} DST={attacker} PROTO=TCP SPT={rport} DPT=443",
                "{ts} {host2} sshd[{pid}]: Received disconnect from {attacker} port 22: disconnected by user",
            ],
        ]

        for stage in stages:
            for tmpl in stage:
                if len(logs) >= count:
                    break
                ts = self._advance(ts)
                logs.append(tmpl.format(
                    ts=self._fmt_ts(ts), host=host, host2=host2,
                    pid=self._pid(), user=user, attacker=attacker,
                    target=target, target2=target2,
                    rport=random.randint(30000, 65535),
                    dport=random.choice(self.PORTS),
                ))
            if len(logs) >= count:
                break

        # If we still need more attack logs, repeat brute-force lines
        while len(logs) < count:
            ts = self._advance(ts)
            logs.append(
                f"{self._fmt_ts(ts)} {host} sshd[{self._pid()}]: "
                f"Failed password for {user} from {attacker} port 22 ssh2"
            )

        return logs

    def _insider_threat(self, count: int, ts: datetime) -> list[str]:
        """Insider off-hours data theft logs."""
        insider = random.choice(self.USERNAMES)
        ext_ip = self._random_external_ip()
        host = random.choice(self.HOSTNAMES)
        file_srv = "file-srv"
        int_ip = self._random_internal_ip()
        logs: list[str] = []

        # Stage 1 — normal daytime logins
        day_tmpls = [
            "{ts} {host} sshd[{pid}]: Accepted publickey for {user} from {int_ip} port 22 ssh2",
            "{ts} {host} systemd[1]: Started Session {sess} of user {user}.",
            "{ts} {host} httpd[{pid}]: {int_ip} - - \"GET /dashboard HTTP/1.1\" 200 4521",
        ]
        # Stage 2 — off-hours large file access at 2 AM
        night_ts = ts.replace(hour=2, minute=random.randint(0, 30))
        night_tmpls = [
            "{ts} {file_srv} sshd[{pid}]: Accepted password for {user} from {int_ip} port 22 ssh2",
            "{ts} {file_srv} kernel: audit: type=1300 msg=audit(1): arch=c000003e syscall=257 success=yes exit=3 a0=ffffff9c a1=7f items=1 ppid={pid} pid={pid2} comm=\"tar\" exe=\"/usr/bin/tar\" key=\"file_access\"",
            "{ts} {file_srv} tar[{pid}]: /data/confidential/customer_records.tar.gz created (2.4 GB)",
        ]
        # Stage 3 — data staging
        staging_tmpls = [
            "{ts} {file_srv} cp[{pid}]: /data/confidential/customer_records.tar.gz -> /tmp/.hidden/staging/",
            "{ts} {file_srv} chmod[{pid}]: mode of '/tmp/.hidden/staging/customer_records.tar.gz' changed to 0600",
        ]
        # Stage 4 — SCP exfiltration
        exfil_tmpls = [
            "{ts} {file_srv} sshd[{pid}]: scp: uploading /tmp/.hidden/staging/customer_records.tar.gz to {ext_ip}:/uploads/",
            "{ts} {file_srv} sshd[{pid}]: Transferred 2.4GB to {ext_ip} via scp",
            "{ts} {file_srv} sshd[{pid}]: scp: connection to {ext_ip} closed",
        ]

        all_stages = [day_tmpls, night_tmpls, staging_tmpls, exfil_tmpls]
        cur_ts = ts
        for i, stage in enumerate(all_stages):
            for tmpl in stage:
                if len(logs) >= count:
                    break
                cur_ts = night_ts if i >= 1 else cur_ts
                cur_ts = self._advance(cur_ts)
                logs.append(tmpl.format(
                    ts=self._fmt_ts(cur_ts), host=host, file_srv=file_srv,
                    pid=self._pid(), pid2=self._pid(), user=insider,
                    int_ip=int_ip, ext_ip=ext_ip,
                    sess=random.randint(1, 9999),
                ))
            if len(logs) >= count:
                break

        while len(logs) < count:
            cur_ts = self._advance(cur_ts)
            logs.append(
                f"{self._fmt_ts(cur_ts)} {file_srv} sshd[{self._pid()}]: "
                f"scp: data transfer to {ext_ip} in progress"
            )

        return logs

    def _ransomware(self, count: int, ts: datetime) -> list[str]:
        """Ransomware kill-chain logs."""
        victim = random.choice(self.USERNAMES)
        attacker = self._random_external_ip()
        host = random.choice(self.HOSTNAMES)
        hosts = random.sample(self.HOSTNAMES, min(4, len(self.HOSTNAMES)))
        logs: list[str] = []

        # Stage 1 — phishing email download
        phish_tmpls = [
            "{ts} {host} httpd[{pid}]: {victim_ip} - - \"GET /invoice_2024.pdf.exe HTTP/1.1\" 200 548012",
            "{ts} {host} kernel: audit: type=1300 msg=audit(1): exe=\"/tmp/invoice_2024.pdf.exe\" pid={pid} comm=\"invoice_2024.p\" key=\"exec\"",
        ]
        # Stage 2 — malware execution
        exec_tmpls = [
            "{ts} {host} kernel: audit: type=1300 msg=audit(1): exe=\"/tmp/invoice_2024.pdf.exe\" success=yes pid={pid} comm=\"ransomware\" key=\"malware_exec\"",
            "{ts} {host} systemd[1]: Started /tmp/invoice_2024.pdf.exe",
            "{ts} {host} kernel: invoice_2024.pdf.exe[{pid}]: attempting to disable Windows Defender analogue",
        ]
        # Stage 3 — lateral movement
        lateral_tmpls = []
        for h in hosts:
            lateral_tmpls.append(
                "{{ts}} {h} sshd[{{pid}}]: Accepted password for root from {{src_ip}} port 22 ssh2".format(h=h)
            )
            lateral_tmpls.append(
                "{{ts}} {h} kernel: audit: exe=\"/tmp/.cache/svchost\" pid={{pid}} comm=\"ransomware\" key=\"lateral\"".format(h=h)
            )
        # Stage 4 — mass encryption
        encrypt_tmpls = []
        for h in hosts:
            encrypt_tmpls.append(
                "{{ts}} {h} kernel: ransomware[{{pid}}]: encrypting /data — 1452 files targeted".format(h=h)
            )
            encrypt_tmpls.append(
                "{{ts}} {h} kernel: ransomware[{{pid}}]: RANSOM_NOTE written to /data/README_DECRYPT.txt".format(h=h)
            )

        all_stages = [phish_tmpls, exec_tmpls, lateral_tmpls, encrypt_tmpls]
        cur_ts = ts
        src_ip = self._random_internal_ip()
        for stage in all_stages:
            for tmpl in stage:
                if len(logs) >= count:
                    break
                cur_ts = self._advance(cur_ts)
                logs.append(tmpl.format(
                    ts=self._fmt_ts(cur_ts), host=host,
                    pid=self._pid(), victim_ip=src_ip,
                    src_ip=src_ip, attacker=attacker,
                ))
            if len(logs) >= count:
                break

        while len(logs) < count:
            cur_ts = self._advance(cur_ts)
            h = random.choice(hosts)
            logs.append(
                f"{self._fmt_ts(cur_ts)} {h} kernel: "
                f"ransomware[{self._pid()}]: encrypting /data — file batch in progress"
            )

        return logs

    def _cryptominer(self, count: int, ts: datetime) -> list[str]:
        """Crypto-mining infection logs."""
        host = random.choice(self.HOSTNAMES)
        mining_pool = random.choice([
            "pool.minexmr.com", "xmr-us-east1.nanopool.org",
            "pool.hashvault.pro", "mine.moneropool.com",
        ])
        c2_ip = self._random_external_ip()
        int_ip = self._random_internal_ip()
        logs: list[str] = []

        # Stage 1 — initial compromise
        comp_tmpls = [
            "{ts} {host} sshd[{pid}]: Accepted password for root from {c2_ip} port 22 ssh2",
            "{ts} {host} kernel: audit: type=1300 msg=audit(1): exe=\"/tmp/.X11-unix/systemd-helper\" pid={pid} key=\"exec\"",
        ]
        # Stage 2 — C2 beacon to mining pool
        c2_tmpls = [
            "{ts} {host} kernel: [UFW ALLOW] IN= OUT=eth0 SRC={int_ip} DST={c2_ip} PROTO=TCP SPT={rport} DPT=4444",
            "{ts} {host} systemd[1]: Started cryptominer service /tmp/.X11-unix/systemd-helper",
            "{ts} {host} kernel: [UFW ALLOW] IN= OUT=eth0 SRC={int_ip} DST=pool.minexmr.com PROTO=TCP SPT={rport} DPT=3333",
            "{ts} {host} httpd[{pid}]: mining pool connection established to {mining_pool}:3333",
        ]
        # Stage 3 — high CPU
        cpu_tmpls = [
            "{ts} {host} kernel: CPU0: Core temperature above threshold, cpu clock throttled (total events = 154290)",
            "{ts} {host} top[{pid}]: systemd-helper PID={pid} CPU=98.7% MEM=4.2% — mining pool beacon active",
            "{ts} {host} kernel: watchdog: BUG: soft lockup - CPU#3 stuck for 22s! [systemd-helper:{pid}]",
        ]
        # Stage 4 — unusual outbound
        out_tmpls = [
            "{ts} {host} kernel: [UFW ALLOW] IN= OUT=eth0 SRC={int_ip} DST={c2_ip} PROTO=TCP SPT={rport} DPT=8333",
            "{ts} {host} kernel: [UFW ALLOW] IN= OUT=eth0 SRC={int_ip} DST={ext2} PROTO=TCP SPT={rport} DPT=3333",
            "{ts} {host} httpd[{pid}]: mining pool beacon keepalive to {mining_pool}:3333",
        ]

        all_stages = [comp_tmpls, c2_tmpls, cpu_tmpls, out_tmpls]
        cur_ts = ts
        for stage in all_stages:
            for tmpl in stage:
                if len(logs) >= count:
                    break
                cur_ts = self._advance(cur_ts)
                logs.append(tmpl.format(
                    ts=self._fmt_ts(cur_ts), host=host,
                    pid=self._pid(), c2_ip=c2_ip,
                    int_ip=int_ip, mining_pool=mining_pool,
                    rport=random.randint(30000, 65535),
                    ext2=self._random_external_ip(),
                ))
            if len(logs) >= count:
                break

        while len(logs) < count:
            cur_ts = self._advance(cur_ts)
            logs.append(
                f"{self._fmt_ts(cur_ts)} {host} httpd[{self._pid()}]: "
                f"mining pool beacon keepalive to {mining_pool}:3333"
            )

        return logs

    # -- Public API -----------------------------------------------------------

    def generate(
        self,
        scenario: str = "apt_intrusion",
        *,
        log_count: int = 50,
        noise_ratio: float = 0.6,
    ) -> list[str]:
        """Generate *log_count* logs for the given *scenario*.

        Parameters
        ----------
        scenario:
            One of ``apt_intrusion``, ``insider_threat``, ``ransomware``,
            ``cryptominer``.
        log_count:
            Total number of log lines to produce (attack + noise).
        noise_ratio:
            Fraction of *log_count* that should be benign noise
            (0.0 = no noise, 0.9 = 90 % noise).

        Returns
        -------
        list[str]
            Chronologically-ordered syslog lines.
        """
        builders = {
            "apt_intrusion": self._apt_intrusion,
            "insider_threat": self._insider_threat,
            "ransomware": self._ransomware,
            "cryptominer": self._cryptominer,
        }
        if scenario not in builders:
            raise ValueError(
                f"Unknown scenario {scenario!r}. "
                f"Choose from {list(builders.keys())}"
            )

        noise_count = int(log_count * noise_ratio)
        attack_count = log_count - noise_count

        now = datetime.now()

        # Build attack and noise logs separately
        attack_logs = builders[scenario](attack_count, now)
        noise_logs = [
            self._benign_log(now + timedelta(seconds=random.randint(0, attack_count * 30)))
            for _ in range(noise_count)
        ]

        # Merge and sort chronologically by timestamp prefix
        combined = attack_logs + noise_logs
        combined.sort(key=lambda line: line[:15])

        return combined
