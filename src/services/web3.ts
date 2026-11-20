/**
 * Web3 Service — Avalanche Fuji C-Chain (Chain ID 43113)
 *
 * Mọi giao dịch ghi (setAuthorizedIssuer, issueBadge) được ký THẬT bởi ví Relayer
 * chạy trong Supabase Edge Function `avalanche-relayer`. Cách này hoạt động giống hệt
 * nhau trên APK (Android) và PWA (iOS / Web) — người dùng không cần cài MetaMask.
 *
 * Không còn chế độ giả lập: nếu Relayer hoặc mạng Fuji lỗi, hàm sẽ ném lỗi để UI báo cho người dùng.
 */
import contractConfig from '../constants/contract.json';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

export const FUJI_RPC_URL =
  process.env.EXPO_PUBLIC_AVAX_FUJI_RPC || 'https://api.avax-test.network/ext/bc/C/rpc';
export const SNOWTRACE_URL = 'https://explorer-test.avax.network/c-chain';
export const CHAIN_ID = 43113;

const RELAYER_URL = `${SUPABASE_URL}/functions/v1/avalanche-relayer`;

/** Địa chỉ contract biết trước ở client (chỉ để hiển thị); Relayer mới là nguồn chính xác */
export const CONTRACT_ADDRESS: string =
  process.env.EXPO_PUBLIC_SKILLPASS_CONTRACT_ADDRESS || contractConfig.address;

export interface RelayerStatus {
  chainId: number;
  blockNumber: number;
  contractAddress: string | null;
  relayer: string | null;
  balance: string | null;
  totalBadges: string | null;
}

async function callRelayer<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }
  const res = await fetch(RELAYER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Avalanche relayer lỗi (HTTP ${res.status})`);
  }
  return data as T;
}

/** Trạng thái mạng Fuji + ví Relayer + contract (đọc thật từ chuỗi) */
export function getRelayerStatus(): Promise<RelayerStatus> {
  return callRelayer<RelayerStatus>({ action: 'status' });
}

/** Cấp Soulbound Token cho sinh viên: SkillBadgeSBT.issueBadge */
export function issueBadgeOnChain(payload: {
  /** Hồ sơ được kiểm tra quyền sở hữu và trạng thái ở Relayer trước khi mint */
  certificateId: string;
  /** Địa chỉ ví 0x… hoặc định danh (email / MSSV) — Relayer sẽ suy ra địa chỉ cố định */
  recipient: string;
  tier: 0 | 1 | 2;
  proofHash: string;
}): Promise<{
  txHash: string;
  tokenId: string | null;
  blockNumber: number | null;
  recipient: string;
  contractAddress: string;
  metadataUri: string;
}> {
  return callRelayer({ action: 'issueBadge', ...payload });
}

export function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 10)}...${hash.slice(-4)}` : hash;
}

export function getSnowtraceTxUrl(txHash: string): string {
  return `${SNOWTRACE_URL}/tx/${txHash}`;
}

export function getSnowtraceAddressUrl(address: string): string {
  return `${SNOWTRACE_URL}/address/${address}`;
}
