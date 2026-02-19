"use client";

import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";

const SOURCES = [
  { name: "Firewall Logs", type: "Network", status: "Active", events: "12.4K/day" },
  { name: "SSH Auth Logs", type: "Authentication", status: "Active", events: "3.2K/day" },
  { name: "Syslog (Linux)", type: "System", status: "Active", events: "8.7K/day" },
  { name: "Web Access Logs", type: "Application", status: "Paused", events: "---" },
];

function getApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000/api";
  return `${window.location.protocol}//${window.location.hostname}:8000/api`;
}

export default function LogSourcesPage() {
  const [watchDir, setWatchDir] = useState("./watch");
  const [running, setRunning] = useState(false);
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/watcher/status`);
      if (res.ok) {
        const data = await res.json();
        setRunning(data.running);
        setCurrentDir(data.watch_dir);
      }
    } catch {
      // API not reachable — leave defaults
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/watcher/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watch_dir: watchDir }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunning(data.running);
        setCurrentDir(data.watch_dir);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/watcher/stop`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRunning(data.running);
        setCurrentDir(data.watch_dir);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Log Sources"
      description="Connected log sources feeding the analysis pipeline"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      }
    >
      {/* Sources Table */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Name</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Type</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Status</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Events</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-[#1a1a2e]">{s.name}</td>
                <td className="px-5 py-3.5 text-gray-600">{s.type}</td>
                <td className="px-5 py-3.5">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                    s.status === "Active"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200"
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-gray-600">{s.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* File Watcher Card */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#1a1a2e]">File Watcher</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Auto-triggers pipeline analysis when log files appear in a watched directory
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
            running
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-gray-50 text-gray-500 border border-gray-200"
          }`}>
            {running ? "Running" : "Stopped"}
          </span>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="watch-dir" className="block text-sm font-medium text-gray-700 mb-1">
              Watch Directory
            </label>
            <input
              id="watch-dir"
              type="text"
              value={watchDir}
              onChange={(e) => setWatchDir(e.target.value)}
              disabled={running}
              placeholder="./watch"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
            {currentDir && running && (
              <p className="text-xs text-gray-400 mt-1">Watching: {currentDir}</p>
            )}
          </div>
          {running ? (
            <button
              onClick={handleStop}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Stopping..." : "Stop"}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading || !watchDir.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Starting..." : "Start"}
            </button>
          )}
        </div>
      </div>
    </PageShell>
  );
}
