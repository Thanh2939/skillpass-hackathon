// Supabase Edge Function: avalanche-relayer
// Ký và thực thi giao dịch trên Avalanche Fuji C-Chain (Chain ID 43113) qua ví Relayer của hệ thống.
// Dùng chung cho cả APK (Android) và PWA (iOS/Web).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ethers } from "npm:ethers@6.13.4";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FUJI_RPC = Deno.env.get("AVALANCHE_FUJI_RPC") ?? "https://api.avax-test.network/ext/bc/C/rpc";
const CHAIN_ID = 43113;

const ABI = [
  "function issueBadge(address recipient, string uri, uint8 tier, bytes32 proofHash) returns (uint256)",
  "function revokeBadge(uint256 tokenId, string reason)",
  "function isAuthorizedIssuer(address) view returns (bool)",
  "function totalBadges() view returns (uint256)",
  "event BadgeIssued(uint256 indexed tokenId, address indexed recipient, address indexed issuer, uint8 tier, bytes32 proofHash, string tokenURI)",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function toAddress(input: string): string {
  if (ethers.isAddress(input)) return ethers.getAddress(input);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(`skillpass:${input.trim().toLowerCase()}`));
  return ethers.getAddress("0x" + hash.slice(-40));
}

function toBytes32(input: string): string {
  if (/^0x[0-9a-fA-F]{64}$/.test(input)) return input;
  return ethers.keccak256(ethers.toUtf8Bytes(input));
}

function getRelayerWallet(provider: ethers.JsonRpcProvider): ethers.Wallet {
  const envPk = Deno.env.get("RELAYER_PRIVATE_KEY");
  if (!envPk || !/^(0x)?[0-9a-fA-F]{64}$/.test(envPk.trim())) {
    throw new Error("RELAYER_PRIVATE_KEY chưa được cấu hình hoặc không hợp lệ.");
  }
  const normalized = envPk.trim().startsWith("0x") ? envPk.trim() : `0x${envPk.trim()}`;
  return new ethers.Wallet(normalized, provider);
}

async function resolveContractAddress(relayerAddress: string): Promise<string> {
  const fromEnv = Deno.env.get("CONTRACT_ADDRESS");
  if (fromEnv && ethers.isAddress(fromEnv)) return fromEnv;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (url && key) {
    const admin = createClient(url, key);
    const { data } = await admin.from("system_settings").select("contract_address").eq("key", "default").single();
    const addr = data?.contract_address as string | undefined;
    if (addr && ethers.isAddress(addr) && addr !== ethers.ZeroAddress) {
      return addr;
    }
  }
  // Địa chỉ hợp đồng định danh theo ví Relayer (CREATE address nonce 0)
  return ethers.getCreateAddress({ from: relayerAddress, nonce: 0 });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = bearerToken(req);
    if (!url || !serviceRoleKey || !token) {
      return json({ error: "Phiên đăng nhập không hợp lệ." }, 401);
    }

    const admin = createClient(url, serviceRoleKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "Phiên đăng nhập đã hết hạn." }, 401);
    }
    const body = await req.json();
    const action = String(body?.action ?? "");
    const userId = authData.user.id;
    const { data: profile } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
    const role = String(profile?.role ?? "");

    const provider = new ethers.JsonRpcProvider(FUJI_RPC, CHAIN_ID);
    const wallet = getRelayerWallet(provider);
    const contractAddress = await resolveContractAddress(wallet.address);

    if (action === "status") {
      const [blockNumber, balanceWei, code] = await Promise.all([
        provider.getBlockNumber(),
        provider.getBalance(wallet.address),
        provider.getCode(contractAddress),
      ]);
      const balance = ethers.formatEther(balanceWei);
      let totalBadges: string | null = null;
      if (code && code !== "0x") {
        try {
          const c = new ethers.Contract(contractAddress, ABI, provider);
          totalBadges = (await c.totalBadges()).toString();
        } catch {
          // ignore
        }
      }
      return json({
        chainId: CHAIN_ID,
        blockNumber,
        contractAddress,
        relayer: wallet.address,
        balance,
        totalBadges,
      });
    }

    const [balanceWei, code] = await Promise.all([provider.getBalance(wallet.address), provider.getCode(contractAddress)]);
    if (code === "0x" || balanceWei === 0n) {
      return json({ error: "Hợp đồng Fuji chưa sẵn sàng hoặc ví relayer thiếu gas." }, 503);
    }

    if (action === "issueBadge") {
      if (role !== "business") {
        return json({ error: "Chỉ tài khoản đối tác được xác minh mới có thể ký chứng chỉ." }, 403);
      }
      const certificateId = String(body.certificateId ?? "").trim();
      if (!certificateId) return json({ error: "Thiếu mã hồ sơ chứng chỉ." }, 400);

      const certQuery = admin
        .from("certificates")
        .select("id, slug_id, student_id, org_id, title, org_name, org_type, student_name, student_mssv, issue_date_original, status, tx_hash")
        .limit(1);
      const { data: certificate, error: certificateError } = /^[0-9a-f-]{36}$/i.test(certificateId)
        ? await certQuery.eq("id", certificateId).maybeSingle()
        : await certQuery.eq("slug_id", certificateId).maybeSingle();
      if (certificateError || !certificate) {
        return json({ error: "Không tìm thấy hồ sơ chứng chỉ." }, 404);
      }
      if (certificate.tx_hash || !["submitted", "under_review"].includes(certificate.status)) {
        return json({ error: "Hồ sơ đã được xử lý hoặc không còn chờ xác minh." }, 409);
      }

      const [{ data: organization }, { data: membership }] = await Promise.all([
        admin.from("organizations").select("name, owner_user_id, kyc_status").eq("id", certificate.org_id).maybeSingle(),
        admin.from("organization_members").select("id").eq("org_id", certificate.org_id).eq("user_id", userId).eq("status", "active").maybeSingle(),
      ]);
      if (!organization || organization.kyc_status !== "verified") {
        return json({ error: "Đơn vị chưa được Admin xác minh." }, 403);
      }
      if (organization.owner_user_id !== userId && !membership) {
        return json({ error: "Hồ sơ không thuộc đơn vị của tài khoản này." }, 403);
      }

      const recipient = toAddress(String(body.recipient ?? ""));
      const tier = Number(body.tier ?? 0);
      if (![0, 1, 2].includes(tier)) return json({ error: "tier không hợp lệ" }, 400);
      const tierName = ["community", "academic", "enterprise"][tier];
      const metadataPath = `${certificate.id}.json`;
      const metadataUri = `${url}/storage/v1/object/public/badge-metadata/${metadataPath}`;
      const proofHash = toBytes32(String(body.proofHash ?? metadataUri));
      const metadata = {
        name: certificate.title,
        description: "Chứng chỉ kỹ năng Soulbound do SkillPass xác minh trên Avalanche Fuji.",
        external_url: `https://skillpass-app-sooty.vercel.app/cert/${certificate.slug_id ?? certificate.id}`,
        attributes: [
          { trait_type: "Đơn vị cấp", value: certificate.org_name ?? organization.name },
          { trait_type: "Loại đơn vị", value: certificate.org_type ?? "other" },
          { trait_type: "Sinh viên", value: certificate.student_name ?? "SkillPass Student" },
          { trait_type: "MSSV", value: certificate.student_mssv ?? "" },
          { trait_type: "Ngày cấp", value: certificate.issue_date_original ?? "" },
          { trait_type: "Tier", value: tierName },
          { trait_type: "Chain ID", value: CHAIN_ID },
        ],
      };
      const { error: metadataError } = await admin.storage
        .from("badge-metadata")
        .upload(metadataPath, new Blob([JSON.stringify(metadata)], { type: "application/json" }), {
          contentType: "application/json",
          upsert: true,
        });
      if (metadataError) throw new Error(`Không lưu được metadata SBT: ${metadataError.message}`);

      const { error: lockError } = await admin.from("badge_issuance_locks").insert({
        certificate_id: certificate.id,
        requested_by: userId,
        state: "claimed",
      });
      if (lockError) {
        if (lockError.code === "23505") {
          return json({ error: "Hồ sơ này đã hoặc đang được phát hành SBT." }, 409);
        }
        throw new Error(`Không khóa được hồ sơ phát hành: ${lockError.message}`);
      }

      let broadcastHash: string | null = null;
      try {
        const contract = new ethers.Contract(contractAddress, ABI, wallet);
        const tx = await contract.issueBadge(recipient, metadataUri, tier, proofHash);
        broadcastHash = tx.hash;
        await admin.from("badge_issuance_locks").update({
          state: "broadcast",
          tx_hash: tx.hash,
          updated_at: new Date().toISOString(),
        }).eq("certificate_id", certificate.id);

        const receipt = await tx.wait(1);
        if (!receipt || receipt.status !== 1) throw new Error("Giao dịch Fuji chưa được xác nhận.");
        let tokenId: string | null = null;
        for (const log of receipt.logs ?? []) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed?.name === "BadgeIssued") tokenId = parsed.args.tokenId.toString();
          } catch {
            // ignore unrelated logs
          }
        }
        if (!tokenId) throw new Error("Giao dịch thiếu sự kiện BadgeIssued.");

        const { data: finalized, error: finalizeError } = await admin.rpc("finalize_badge_issuance", {
          p_certificate_id: certificate.id,
          p_requested_by: userId,
          p_token_id: tokenId,
          p_contract_address: contractAddress,
          p_chain_id: CHAIN_ID,
          p_tx_hash: tx.hash,
          p_metadata_uri: metadataUri,
          p_proof_hash: proofHash,
          p_tier: tierName,
          p_reviewer_label: organization.name,
        });
        if (finalizeError || finalized !== true) {
          throw new Error(`Giao dịch đã xác nhận nhưng chưa đồng bộ database: ${finalizeError?.message ?? "unknown"}`);
        }

        return json({
          txHash: tx.hash,
          tokenId,
          blockNumber: receipt.blockNumber,
          recipient,
          contractAddress,
          metadataUri,
        });
      } catch (issueError) {
        const message = issueError instanceof Error ? issueError.message : String(issueError);
        await admin.from("badge_issuance_locks").update({
          state: broadcastHash ? "broadcast" : "failed",
          tx_hash: broadcastHash,
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq("certificate_id", certificate.id);
        throw issueError;
      }
    }

    return json({ error: `Action không hỗ trợ: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
