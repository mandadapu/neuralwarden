"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createRepoConnection,
  listGitHubOrgs,
  listGitHubRepos,
  scanRepoConnectionStream,
  setApiUserEmail,
} from "@/lib/api";
import type { RepoConnection, GitHubOrg, GitHubRepo } from "@/lib/types";
import { useSession } from "next-auth/react";

const PURPOSES = ["production", "staging", "development"];

type WizardData = {
  source: "real" | "sample" | "";
  org: string;
  orgAvatar: string;
  repos: GitHubRepo[];
  selectedRepos: Set<string>; // full_name set
  allRepos: boolean;
  name: string;
  purpose: string;
  scanSecrets: boolean;
  scanDeps: boolean;
  scanCode: boolean;
};

export default function ConnectRepoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    source: "",
    org: "",
    orgAvatar: "",
    repos: [],
    selectedRepos: new Set(),
    allRepos: true,
    name: "",
    purpose: "production",
    scanSecrets: true,
    scanDeps: true,
    scanCode: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdConn, setCreatedConn] = useState<RepoConnection | null>(null);

  // Org fetching
  const [orgs, setOrgs] = useState<GitHubOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  // Repo fetching
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  // Set API user email from session
  useEffect(() => {
    if (session?.user?.email) {
      setApiUserEmail(session.user.email);
    }
  }, [session]);

  // Fetch orgs when entering step 2
  useEffect(() => {
    if (step === 2) {
      setOrgsLoading(true);
      setOrgsError(null);
      listGitHubOrgs()
        .then((result) => {
          setOrgs(result);
        })
        .catch((err) => {
          setOrgsError(
            err.message?.includes("Failed")
              ? "GitHub token not configured. Ask your admin to set GITHUB_TOKEN."
              : err.message
          );
        })
        .finally(() => setOrgsLoading(false));
    }
  }, [step]);

  // Fetch repos when entering step 3
  useEffect(() => {
    if (step === 3 && data.org) {
      setReposLoading(true);
      setReposError(null);
      listGitHubRepos(data.org)
        .then((result) => {
          setData((d) => ({
            ...d,
            repos: result,
            selectedRepos: new Set(result.map((r) => r.full_name)),
          }));
        })
        .catch((err) => {
          setReposError(err.message);
        })
        .finally(() => setReposLoading(false));
    }
  }, [step, data.org]);

  function selectSource(source: "real" | "sample") {
    setData((d) => ({ ...d, source }));
    if (source === "real") {
      setStep(2);
    } else {
      // Sample workspace -- create immediately
      handleSampleConnect();
    }
  }

  async function handleSampleConnect() {
    setSaving(true);
    setSaveError(null);
    try {
      const conn = await createRepoConnection({
        name: "Sample Repos",
        org_name: "demo-org",
        purpose: "development",
        scan_config: JSON.stringify({
          secrets: true,
          dependencies: true,
          code_patterns: true,
        }),
      });
      setCreatedConn(conn);
      setData((d) => ({ ...d, source: "sample" }));
      setStep(5);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to create sample connection"
      );
      setSaving(false);
    }
  }

  function selectOrg(login: string, avatarUrl: string) {
    setData((d) => ({
      ...d,
      org: login,
      orgAvatar: avatarUrl,
      name: `${login} Repos`,
    }));
    setStep(3);
  }

  function toggleRepo(fullName: string) {
    setData((d) => {
      const next = new Set(d.selectedRepos);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return {
        ...d,
        selectedRepos: next,
        allRepos: next.size === d.repos.length,
      };
    });
  }

  function toggleAllRepos() {
    setData((d) => {
      const newAll = !d.allRepos;
      return {
        ...d,
        allRepos: newAll,
        selectedRepos: newAll
          ? new Set(d.repos.map((r) => r.full_name))
          : new Set(),
      };
    });
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  function handleNext() {
    setStep((s) => s + 1);
  }

  async function handleConnectAndScan() {
    setSaving(true);
    setSaveError(null);
    try {
      const selectedRepoData = data.repos
        .filter((r) => data.selectedRepos.has(r.full_name))
        .map((r) => ({
          full_name: r.full_name,
          name: r.name,
          language: r.language,
          default_branch: r.default_branch,
          private: r.private,
        }));

      const scanTypes: string[] = [];
      if (data.scanSecrets) scanTypes.push("secrets");
      if (data.scanDeps) scanTypes.push("dependencies");
      if (data.scanCode) scanTypes.push("code_patterns");

      const conn = await createRepoConnection({
        name: data.name,
        org_name: data.org,
        purpose: data.purpose,
        scan_config: JSON.stringify({
          secrets: data.scanSecrets,
          dependencies: data.scanDeps,
          code_patterns: data.scanCode,
        }),
        repos: selectedRepoData,
      });

      setCreatedConn(conn);
      setStep(5);

      // Auto-start first scan in the background
      scanRepoConnectionStream(conn.id, () => {}).then(() => {
        window.dispatchEvent(new Event("repoScanCompleted"));
      }).catch(() => {
        // scan error is non-blocking on wizard completion
      });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to create repo connection"
      );
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const selectedCount = data.allRepos
    ? data.repos.length
    : data.selectedRepos.size;

  const scanTypeLabels: string[] = [];
  if (data.scanSecrets) scanTypeLabels.push("Secrets Detection");
  if (data.scanDeps) scanTypeLabels.push("Dependency Scanning");
  if (data.scanCode) scanTypeLabels.push("Code Patterns");

  return (
    <div className="min-h-screen flex">
      {/* Left panel -- branding */}
      <div className="w-80 min-w-80 bg-[#0d1117] text-white flex flex-col justify-between p-8">
        <div>
          <Link
            href="/repositories"
            className="flex items-center gap-2 mb-10 text-[#8b949e] hover:text-white text-sm transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Repositories
          </Link>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00e68a]/20 to-[#009952]/10 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className="text-lg font-bold">NeuralWarden</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Connect your repository</h2>
          <p className="text-sm text-[#8b949e] leading-relaxed">
            NeuralWarden will scan your code repositories for secrets, vulnerable
            dependencies, and insecure code patterns.
          </p>

          {/* Step indicators */}
          <div className="mt-10 space-y-4">
            {[
              { n: 1, label: "Choose Source" },
              { n: 2, label: "Select Organization" },
              { n: 3, label: "Configure" },
              { n: 4, label: "Review & Connect" },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step > n || step === 5
                      ? "bg-emerald-500 text-white"
                      : step === n
                        ? "bg-primary text-white"
                        : "bg-white/10 text-[#8b949e]"
                  }`}
                >
                  {step > n || step === 5 ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    n
                  )}
                </div>
                <span
                  className={`text-sm ${step >= n ? "text-white" : "text-[#8b949e]"}`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#c9d1d9]">
          Your tokens are encrypted and stored securely.
        </p>
      </div>

      {/* Right panel -- content */}
      <div className="flex-1 bg-[#1c2128] flex items-start justify-center p-10 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Step 1: Choose Source */}
          {step === 1 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                Choose your source
              </h3>
              <p className="text-sm text-[#8b949e] mb-8">
                Select how you want to connect your repositories.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => selectSource("real")}
                  className="w-full flex items-center gap-4 p-5 border-2 border-[#30363d] rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#f0f6fc]/10 flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path
                        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                        fill="#c9d1d9"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-white">
                      Real Organization
                    </div>
                    <div className="text-sm text-[#8b949e]">
                      Connect to your GitHub organization or personal repos
                    </div>
                  </div>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#8b949e"
                    strokeWidth="2"
                    className="ml-auto"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                <button
                  onClick={() => selectSource("sample")}
                  disabled={saving}
                  className="w-full flex items-center gap-4 p-5 border-2 border-[#30363d] rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left cursor-pointer disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a78bfa"
                      strokeWidth="1.5"
                    >
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-white">
                      Sample Workspace
                    </div>
                    <div className="text-sm text-[#8b949e]">
                      Try with demo data -- no GitHub token needed
                    </div>
                  </div>
                  {saving ? (
                    <div className="ml-auto w-5 h-5 border-2 border-[#8b949e]/30 border-t-[#8b949e] rounded-full animate-spin" />
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#8b949e"
                      strokeWidth="2"
                      className="ml-auto"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </button>
              </div>

              {saveError && (
                <div className="flex items-center gap-2 p-3 mt-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  {saveError}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Organization */}
          {step === 2 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                Select organization
              </h3>
              <p className="text-sm text-[#8b949e] mb-8">
                Choose the GitHub organization or personal account to scan.
              </p>

              {orgsLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                  <p className="text-sm text-[#8b949e]">
                    Fetching organizations...
                  </p>
                </div>
              )}

              {orgsError && (
                <div className="flex items-center gap-2 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  {orgsError}
                </div>
              )}

              {!orgsLoading && !orgsError && (
                <div className="space-y-3">
                  {/* Personal account option */}
                  {session?.user && (
                    <button
                      onClick={() =>
                        selectOrg(
                          session.user?.name ?? session.user?.email ?? "personal",
                          session.user?.image ?? ""
                        )
                      }
                      className="w-full flex items-center gap-4 p-4 border-2 border-[#30363d] rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#21262d] overflow-hidden flex items-center justify-center flex-shrink-0">
                        {session.user.image ? (
                          <img
                            src={session.user.image}
                            alt=""
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#8b949e"
                            strokeWidth="2"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate">
                          {session.user.name ?? session.user.email}
                        </div>
                        <div className="text-sm text-[#8b949e]">
                          Personal Account
                        </div>
                      </div>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#8b949e"
                        strokeWidth="2"
                        className="ml-auto flex-shrink-0"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  )}

                  {/* Organization list */}
                  {orgs.map((org) => (
                    <button
                      key={org.login}
                      onClick={() => selectOrg(org.login, org.avatar_url)}
                      className="w-full flex items-center gap-4 p-4 border-2 border-[#30363d] rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#21262d] overflow-hidden flex-shrink-0">
                        {org.avatar_url ? (
                          <img
                            src={org.avatar_url}
                            alt=""
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#30363d] flex items-center justify-center">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#8b949e"
                              strokeWidth="2"
                            >
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate">
                          {org.login}
                        </div>
                        {org.description && (
                          <div className="text-sm text-[#8b949e] truncate">
                            {org.description}
                          </div>
                        )}
                      </div>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#8b949e"
                        strokeWidth="2"
                        className="ml-auto flex-shrink-0"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}

                  {orgs.length === 0 && !session?.user && (
                    <p className="text-sm text-[#8b949e] text-center py-8">
                      No organizations found.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="px-5 py-2.5 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configure */}
          {step === 3 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Configure</h3>
              <p className="text-sm text-[#8b949e] mb-6">
                Select repositories and configure scan settings.
              </p>

              {reposLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                  <p className="text-sm text-[#8b949e]">
                    Fetching repositories...
                  </p>
                </div>
              )}

              {reposError && (
                <div className="flex items-center gap-2 p-4 mb-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  {reposError}
                </div>
              )}

              {!reposLoading && !reposError && (
                <div className="space-y-5">
                  {/* All repos toggle */}
                  <label className="flex items-center gap-3 p-3 border border-[#30363d] rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={data.allRepos}
                      onChange={toggleAllRepos}
                      className="w-4 h-4 text-primary border-[#30363d] rounded focus:ring-primary"
                    />
                    <span className="text-sm font-medium text-[#e6edf3]">
                      All repositories
                    </span>
                    <span className="text-xs text-[#8b949e] ml-auto">
                      {data.repos.length} repos
                    </span>
                  </label>

                  {/* Repo list */}
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                    {data.repos.map((repo) => (
                      <label
                        key={repo.full_name}
                        className="flex items-center gap-3 p-3 border border-[#30363d] rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={data.selectedRepos.has(repo.full_name)}
                          onChange={() => toggleRepo(repo.full_name)}
                          className="w-4 h-4 text-primary border-[#30363d] rounded focus:ring-primary flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#e6edf3] truncate">
                              {repo.name}
                            </span>
                            {repo.language && (
                              <span className="px-1.5 py-0.5 text-xs font-medium bg-[#262c34] text-[#8b949e] rounded">
                                {repo.language}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                repo.private
                                  ? "bg-yellow-500/10 text-yellow-500"
                                  : "bg-emerald-500/10 text-emerald-500"
                              }`}
                            >
                              {repo.private ? "Private" : "Public"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {repo.stargazers_count > 0 && (
                              <span className="text-xs text-[#8b949e] flex items-center gap-1">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="#8b949e"
                                >
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                {repo.stargazers_count}
                              </span>
                            )}
                            {repo.pushed_at && (
                              <span className="text-xs text-[#8b949e]">
                                Pushed {formatDate(repo.pushed_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-[#30363d]" />

                  {/* Connection name */}
                  <div>
                    <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">
                      Connection Name
                    </label>
                    <input
                      type="text"
                      value={data.name}
                      onChange={(e) =>
                        setData((d) => ({ ...d, name: e.target.value }))
                      }
                      placeholder={`${data.org} Repos`}
                      className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>

                  {/* Purpose */}
                  <div>
                    <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">
                      Purpose
                    </label>
                    <select
                      value={data.purpose}
                      onChange={(e) =>
                        setData((d) => ({ ...d, purpose: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-[#21262d] text-white"
                    >
                      {PURPOSES.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Scan types */}
                  <div>
                    <label className="block text-sm font-medium text-[#e6edf3] mb-3">
                      Scan types
                    </label>
                    <div className="space-y-2.5">
                      <label className="flex items-center gap-3 p-3 border border-[#30363d] rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={data.scanSecrets}
                          onChange={() =>
                            setData((d) => ({
                              ...d,
                              scanSecrets: !d.scanSecrets,
                            }))
                          }
                          className="w-4 h-4 text-primary border-[#30363d] rounded focus:ring-primary"
                        />
                        <div>
                          <span className="text-sm text-[#e6edf3]">
                            Secrets Detection
                          </span>
                          <p className="text-xs text-[#8b949e]">
                            Find API keys, tokens, and credentials in code
                          </p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-[#30363d] rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={data.scanDeps}
                          onChange={() =>
                            setData((d) => ({ ...d, scanDeps: !d.scanDeps }))
                          }
                          className="w-4 h-4 text-primary border-[#30363d] rounded focus:ring-primary"
                        />
                        <div>
                          <span className="text-sm text-[#e6edf3]">
                            Dependency Scanning
                          </span>
                          <p className="text-xs text-[#8b949e]">
                            Check for vulnerable packages and outdated
                            dependencies
                          </p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-[#30363d] rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={data.scanCode}
                          onChange={() =>
                            setData((d) => ({ ...d, scanCode: !d.scanCode }))
                          }
                          className="w-4 h-4 text-primary border-[#30363d] rounded focus:ring-primary"
                        />
                        <div>
                          <span className="text-sm text-[#e6edf3]">
                            Code Patterns
                          </span>
                          <p className="text-xs text-[#8b949e]">
                            Detect insecure coding patterns and misconfigurations
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="px-5 py-2.5 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={selectedCount === 0 || !data.name.trim()}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Connect */}
          {step === 4 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                Review & Connect
              </h3>
              <p className="text-sm text-[#8b949e] mb-8">
                Review your configuration and connect your repositories.
              </p>

              <div className="bg-[#21262d] rounded-xl p-5 space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Provider</span>
                  <span className="text-sm font-medium text-white flex items-center gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path
                        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                        fill="#c9d1d9"
                      />
                    </svg>
                    GitHub
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Organization</span>
                  <span className="text-sm font-medium text-white flex items-center gap-2">
                    {data.orgAvatar && (
                      <img
                        src={data.orgAvatar}
                        alt=""
                        className="w-4 h-4 rounded-full"
                      />
                    )}
                    {data.org}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">
                    Repos selected
                  </span>
                  <span className="text-sm font-medium text-white">
                    {selectedCount}{" "}
                    {selectedCount === 1 ? "repository" : "repositories"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Name</span>
                  <span className="text-sm font-medium text-white">
                    {data.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Purpose</span>
                  <span className="text-sm font-medium text-white capitalize">
                    {data.purpose}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-[#8b949e]">Scan types</span>
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-xs">
                    {scanTypeLabels.map((label) => (
                      <span
                        key={label}
                        className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
                  {saveError}
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={handleBack}
                  className="px-5 py-2.5 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConnectAndScan}
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {saving ? "Connecting..." : "Connect & Scan"}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && createdConn && (
            <div className="text-center py-10">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                Repository Connected!
              </h3>
              <p className="text-[#8b949e] mb-2">
                <span className="font-medium text-white">
                  {createdConn.name}
                </span>{" "}
                has been successfully connected.
              </p>
              <p className="text-sm text-[#8b949e] mb-8">
                Scanning started! Results in about a minute.
              </p>

              {/* Success animation dots */}
              <div className="flex items-center justify-center gap-2 mb-8">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-emerald-400"
                    style={{
                      animation: `bounce 0.6s ${i * 0.1}s ease-in-out infinite alternate`,
                    }}
                  />
                ))}
              </div>
              <style>{`@keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-8px); } }`}</style>

              <button
                onClick={() => router.push(`/repositories/${createdConn.id}`)}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
              >
                Go to Repository
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
