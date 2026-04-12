import { Capacitor } from '@capacitor/core';
import { HttpClientError, type HttpMethod, requestJson } from '../lib/httpClient';

const LOCAL_DEV_API_URL = 'http://localhost:3000';
const PROD_API_URL_FALLBACK = 'https://congregation-api.onrender.com';
const MANUAL_API_URL_KEY = 'gate_api_url_override';
const LAST_WORKING_API_URL_KEY = 'gate_last_working_api_url';

export type ApiSource =
  | 'manual'
  | 'last-working'
  | 'env'
  | 'fallback'
  | 'local-dev';

export interface ApiResolution {
  baseUrl: string;
  source: ApiSource;
}

let resolvedApi: ApiResolution | null = null;

function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) throw new Error('Backend URL cannot be empty.');

  if (!/^https?:\/\//i.test(url)) {
    const lower = url.toLowerCase();
    const isLocalHost =
      lower.startsWith('localhost') ||
      lower.startsWith('127.0.0.1') ||
      lower.startsWith('10.') ||
      lower.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower);
    url = `${isLocalHost ? 'http' : 'https'}://${url}`;
  }

  const parsed = new URL(url);
  return parsed.toString().replace(/\/+$/, '');
}

function getStoredUrl(key: string): string | null {
  const raw = localStorage.getItem(key)?.trim();
  if (!raw) return null;

  try {
    return normalizeUrl(raw);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function getEnvApiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;

  try {
    return normalizeUrl(raw);
  } catch {
    return null;
  }
}

function getUniqueCandidates(): ApiResolution[] {
  if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
    return [{ baseUrl: LOCAL_DEV_API_URL, source: 'local-dev' }];
  }

  const candidates: Array<ApiResolution | null> = [
    getManualApiBaseUrl() ? { baseUrl: getManualApiBaseUrl()!, source: 'manual' } : null,
    getLastWorkingApiBaseUrl() ? { baseUrl: getLastWorkingApiBaseUrl()!, source: 'last-working' } : null,
    getEnvApiBaseUrl() ? { baseUrl: getEnvApiBaseUrl()!, source: 'env' } : null,
    { baseUrl: PROD_API_URL_FALLBACK, source: 'fallback' },
  ];

  const seen = new Set<string>();
  return candidates.filter((candidate): candidate is ApiResolution => {
    if (!candidate) return false;
    if (seen.has(candidate.baseUrl)) return false;
    seen.add(candidate.baseUrl);
    return true;
  });
}

function rememberWorkingApi(candidate: ApiResolution): void {
  resolvedApi = candidate;
  localStorage.setItem(LAST_WORKING_API_URL_KEY, candidate.baseUrl);
}

function getOrderedCandidates(forceRefresh = false): ApiResolution[] {
  const candidates = getUniqueCandidates();

  if (forceRefresh || !resolvedApi) return candidates;

  return [
    resolvedApi,
    ...candidates.filter(candidate => candidate.baseUrl !== resolvedApi?.baseUrl),
  ];
}

export function joinApiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function getManualApiBaseUrl(): string | null {
  return getStoredUrl(MANUAL_API_URL_KEY);
}

export function setManualApiBaseUrl(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl);
  localStorage.setItem(MANUAL_API_URL_KEY, normalized);
  invalidateResolvedApiBaseUrl();
  return normalized;
}

export function clearManualApiBaseUrl(): void {
  localStorage.removeItem(MANUAL_API_URL_KEY);
  invalidateResolvedApiBaseUrl();
}

export function getLastWorkingApiBaseUrl(): string | null {
  return getStoredUrl(LAST_WORKING_API_URL_KEY);
}

export function invalidateResolvedApiBaseUrl(): void {
  resolvedApi = null;
}

export async function resolveApiBaseUrl(forceRefresh = false): Promise<ApiResolution> {
  const [candidate] = getOrderedCandidates(forceRefresh);
  if (!candidate) throw new Error('No backend URL is configured.');
  resolvedApi = candidate;
  return candidate;
}

export async function requestApiJson<T>(
  method: HttpMethod,
  path: string,
  options?: {
    headers?: Record<string, string>;
    data?: unknown;
    timeoutMs?: number;
    forceRefresh?: boolean;
  },
): Promise<T> {
  const candidates = getOrderedCandidates(options?.forceRefresh);
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const data = await requestJson<T>(method, joinApiUrl(candidate.baseUrl, path), options);
      rememberWorkingApi(candidate);
      return data;
    } catch (error) {
      if (error instanceof HttpClientError && error.status) {
        rememberWorkingApi(candidate);
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown connection failure';
      failures.push(`${candidate.baseUrl} (${message})`);
    }
  }

  throw new Error(`Could not reach any backend URL. Tried: ${failures.join(' | ')}`);
}
