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
} from "./api";
import type { CloudAccount, CloudIssue, CloudAsset, RepoConnection, RepoIssue } from "./types";

/** Default SWR options: revalidate on focus, dedupe within 5s */
const defaults: SWRConfiguration = {
  revalidateOnFocus: true,
  dedupingInterval: 5000,
};

/** SWR key prefix — helps with global mutations */
export const SWR_KEYS = {
  clouds: "/api/clouds",
  repos: "/api/repos",
  cloud: (id: string) => `/api/clouds/${id}`,
  cloudIssues: (id: string) => `/api/clouds/${id}/issues`,
  cloudAssets: (id: string) => `/api/clouds/${id}/assets`,
  repo: (id: string) => `/api/repos/${id}`,
  repoIssues: (id: string) => `/api/repos/${id}/issues`,
};

/* ── Cloud hooks ──────────────────────────────────────── */

export function useClouds() {
  return useSWR<CloudAccount[]>(SWR_KEYS.clouds, () => listClouds(), defaults);
}

export function useCloud(id: string | undefined) {
  return useSWR<CloudAccount>(
    id ? SWR_KEYS.cloud(id) : null,
    () => getCloud(id!),
    defaults,
  );
}

export function useCloudIssues(cloudId: string | undefined) {
  return useSWR<CloudIssue[]>(
    cloudId ? SWR_KEYS.cloudIssues(cloudId) : null,
    () => listCloudIssues(cloudId!),
    defaults,
  );
}

export function useCloudAssets(cloudId: string | undefined) {
  return useSWR<CloudAsset[]>(
    cloudId ? SWR_KEYS.cloudAssets(cloudId) : null,
    () => listCloudAssets(cloudId!),
    defaults,
  );
}

/* ── Repo hooks ───────────────────────────────────────── */

export function useRepoConnections() {
  return useSWR<RepoConnection[]>(SWR_KEYS.repos, () => listRepoConnections(), defaults);
}

export function useRepoConnection(id: string | undefined) {
  return useSWR<RepoConnection>(
    id ? SWR_KEYS.repo(id) : null,
    () => getRepoConnection(id!),
    defaults,
  );
}

export function useRepoIssues(connectionId: string | undefined) {
  return useSWR<RepoIssue[]>(
    connectionId ? SWR_KEYS.repoIssues(connectionId) : null,
    () => listRepoIssues(connectionId!),
    defaults,
  );
}
