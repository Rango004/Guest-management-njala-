import axios, { AxiosError } from 'axios';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class HttpClientError extends Error {
  status?: number;
  code?: string;
  data?: unknown;
  url: string;
  method: HttpMethod;

  constructor(args: {
    message: string;
    url: string;
    method: HttpMethod;
    status?: number;
    code?: string;
    data?: unknown;
  }) {
    super(args.message);
    this.name = 'HttpClientError';
    this.url = args.url;
    this.method = args.method;
    this.status = args.status;
    this.code = args.code;
    this.data = args.data;
  }
}

function normalizeData<T>(data: unknown): T {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T;
    }
  }
  return data as T;
}

export async function requestJson<T>(
  method: HttpMethod,
  url: string,
  options?: {
    headers?: Record<string, string>;
    data?: unknown;
    timeoutMs?: number;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const headers = {
    Accept: 'application/json',
    ...(options?.data ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers ?? {}),
  };

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: options?.data,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });

      if (response.status >= 400) {
        throw new HttpClientError({
          message: `HTTP ${response.status}`,
          method,
          url,
          status: response.status,
          data: normalizeData(response.data),
        });
      }

      return normalizeData<T>(response.data);
    } catch (error) {
      if (error instanceof HttpClientError) throw error;
      const message = error instanceof Error ? error.message : 'Native request failed';
      throw new HttpClientError({
        message,
        method,
        url,
      });
    }
  }

  try {
    const response = await axios.request<T>({
      url,
      method,
      data: options?.data,
      headers,
      timeout: timeoutMs,
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    const axiosErr = error as AxiosError;
    throw new HttpClientError({
      message: axiosErr.message || 'Request failed',
      method,
      url,
      status: axiosErr.response?.status,
      code: axiosErr.code,
      data: axiosErr.response?.data,
    });
  }
}
