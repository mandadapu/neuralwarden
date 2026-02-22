/**
 * SWR hooks for NeuralWarden API calls.
 *
 * Provides automatic caching, deduplication, and background revalidation
 * for the most frequently accessed endpoints.
 */

import useSWR, { type SWRConfiguration } from "swr";
import {
  listClouds,
  listCloudIssues,
  listCloudAssets,
  getCloud,
  listRepoConnections,
  getRepoConnection,
  listRepoIssues,
  listPentests,
  getPentest,
  listFindings,
  isApiReady,
} from "./api";
import type { CloudAccount, CloudIssue, CloudAsset, RepoConnection, RepoIssue, Pentest, PentestFinding } from "./types";

/** Default SWR options: revalidate on focus, dedupe within 5s */
const defaults: SWRConfiguration = {
  revalidateOnFocus: true,
  dedupingInterval: 5000,
};

/** Return the key only when the API token is set, otherwise null (skip fetch). */
function whenReady(key: string | null): string | null {
  return key && isApiReady() ? key : null;
}

/** SWR key prefix — helps with global mutations */
export const SWR_KEYS = {
  clouds: "/api/clouds",
  repos: "/api/repos",
  pentests: "/api/pentests",
  cloud: (id: string) => `/api/clouds/${id}`,
  cloudIssues: (id: string) => `/api/clouds/${id}/issues`,
  cloudAssets: (id: string) => `/api/clouds/${id}/assets`,
  repo: (id: string) => `/api/repos/${id}`,
  repoIssues: (id: string) => `/api/repos/${id}/issues`,
  pentest: (id: string) => `/api/pentests/${id}`,
  pentestFindings: (id: string) => `/api/pentests/${id}/findings`,
};

/* ── Cloud hooks ──────────────────────────────────────── */

export function useClouds() {
  return useSWR<CloudAccount[]>(whenReady(SWR_KEYS.clouds), () => listClouds(), defaults);
}

export function useCloud(id: string | undefined) {
  return useSWR<CloudAccount>(
    whenReady(id ? SWR_KEYS.cloud(id) : null),
    () => getCloud(id!),
    defaults,
  );
}

export function useCloudIssues(cloudId: string | undefined) {
  return useSWR<CloudIssue[]>(
    whenReady(cloudId ? SWR_KEYS.cloudIssues(cloudId) : null),
    () => listCloudIssues(cloudId!),
    defaults,
  );
}

export function useCloudAssets(cloudId: string | undefined) {
  return useSWR<CloudAsset[]>(
    whenReady(cloudId ? SWR_KEYS.cloudAssets(cloudId) : null),
    () => listCloudAssets(cloudId!),
    defaults,
  );
}

/* ── Repo hooks ───────────────────────────────────────── */

export function useRepoConnections() {
  return useSWR<RepoConnection[]>(whenReady(SWR_KEYS.repos), () => listRepoConnections(), defaults);
}

export function useRepoConnection(id: string | undefined) {
  return useSWR<RepoConnection>(
    whenReady(id ? SWR_KEYS.repo(id) : null),
    () => getRepoConnection(id!),
    defaults,
  );
}

export function useRepoIssues(connectionId: string | undefined) {
  return useSWR<RepoIssue[]>(
    whenReady(connectionId ? SWR_KEYS.repoIssues(connectionId) : null),
    () => listRepoIssues(connectionId!),
    defaults,
  );
}

/* ── Pentest hooks ─────────────────────────────────────── */

export function usePentests() {
  return useSWR<Pentest[]>(whenReady(SWR_KEYS.pentests), () => listPentests(), defaults);
}

export function usePentest(id: string | undefined) {
  return useSWR<Pentest>(
    whenReady(id ? SWR_KEYS.pentest(id) : null),
    () => getPentest(id!),
    defaults,
  );
}

export function usePentestFindings(pentestId: string | undefined) {
  return useSWR<PentestFinding[]>(
    whenReady(pentestId ? SWR_KEYS.pentestFindings(pentestId) : null),
    () => listFindings(pentestId!),
    defaults,
  );
}
