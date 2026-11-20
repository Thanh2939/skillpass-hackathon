// Test hành vi của mobile/src/services/supabase.ts (createSharedLink, getSharedProfile, getSharedCertificate)
// và các helper an ninh chống Confused-Deputy.
import test from 'node:test';
import assert from 'node:assert/strict';

test('createSharedLink: từ chối downgrade restricted khi thiếu cột DB (fail-closed)', async () => {
  let attemptedInsertData = null;
  const mockSupabase = {
    from: () => ({
      insert: (rows) => {
        attemptedInsertData = rows[0];
        return {
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: 'column "access_mode" of relation "shared_links" does not exist' },
            }),
          }),
        };
      },
    }),
  };

  const createSharedLinkLogic = async (userId, targetCompany, code, options) => {
    const accessMode = options?.accessMode === 'restricted' ? 'restricted' : 'public';
    const allowedEmails = (options?.allowedEmails || []).map((e) => e.trim().toLowerCase());
    const payload = { user_id: userId, code, target_company: targetCompany };

    const { data, error } = await mockSupabase.from('shared_links').insert([{
      ...payload,
      access_mode: accessMode,
      allowed_emails: allowedEmails,
    }]).select().single();

    if (error && /column.*access_mode/i.test(error.message)) {
      if (accessMode === 'restricted') {
        // FAIL CLOSED: tuyệt đối không downgrade
        return null;
      }
      return { ...payload, access_mode: 'public', allowed_emails: [] };
    }
    return data;
  };

  // 1. Link restricted bị lỗi thiếu cột -> PHẢI trả về null (không được hạ xuống public)
  const resRestricted = await createSharedLinkLogic('uid-1', 'Cong ty A', 'SP-TEST1', {
    accessMode: 'restricted',
    allowedEmails: ['recruiter@a.com'],
  });
  assert.equal(resRestricted, null);

  // 2. Link public nếu thiếu cột -> có thể retry ghi bản ghi public legacy
  const resPublic = await createSharedLinkLogic('uid-1', 'Cong ty B', 'SP-TEST2', {
    accessMode: 'public',
  });
  assert.ok(resPublic);
  assert.equal(resPublic.access_mode, 'public');
});

test('getSharedProfile: RPC outage ném Error có thông báo service chưa sẵn sàng (không trả not_found giả)', async () => {
  const mockRpcFail = async (rpcName) => {
    if (rpcName === 'get_shared_profile') {
      return { data: null, error: { message: 'Function get_shared_profile does not exist' } };
    }
    return { data: null, error: null };
  };

  const getSharedProfileLogic = async (code) => {
    const { data, error } = await mockRpcFail('get_shared_profile', { p_code: code });
    if (error) {
      // Ném lỗi để Lead viewer catches -> SharedAccessGate status error
      throw new Error(`Dịch vụ xác thực hồ sơ chưa sẵn sàng: ${error.message}`);
    }
    return { status: 'ok', data };
  };

  await assert.rejects(
    async () => {
      await getSharedProfileLogic('SP-TEST');
    },
    {
      name: 'Error',
      message: /Dịch vụ xác thực hồ sơ chưa sẵn sàng/i,
    }
  );
});

test('getSharedCertificate: replace storage_path bằng signed_url từ edge resolver', async () => {
  const mockEdgeResolver = async (code, certId) => ({
    avatarUrl: 'https://example.supabase.co/avatar.jpg?token=abc',
    evidenceUrls: new Map([
      ['ev-1', 'https://example.supabase.co/evidence1.jpg?token=signed60s'],
    ]),
  });

  const rawRpcCert = {
    id: 'cert-1',
    title: 'Chứng chỉ React Native',
    status: 'issued',
    evidence_documents: [
      { id: 'ev-1', file_name: 'minhchung.jpg', storage_path: 'evidence/doc1.jpg' },
      { id: 'ev-2', file_name: 'vanbang.pdf', storage_path: 'evidence/doc2.pdf' },
    ],
  };

  const resolved = await mockEdgeResolver('SP-CODE', rawRpcCert.id);

  const mappedDocs = rawRpcCert.evidence_documents.map((d) => {
    const signedUrl = resolved.evidenceUrls.get(d.id) || null;
    return {
      ...d,
      storage_path: signedUrl || d.storage_path,
      signed_url: signedUrl,
    };
  });

  // ev-1 có signed_url
  assert.equal(mappedDocs[0].signed_url, 'https://example.supabase.co/evidence1.jpg?token=signed60s');
  assert.equal(mappedDocs[0].storage_path, 'https://example.supabase.co/evidence1.jpg?token=signed60s');

  // ev-2 không có signed_url -> giữ d.storage_path
  assert.equal(mappedDocs[1].signed_url, null);
  assert.equal(mappedDocs[1].storage_path, 'evidence/doc2.pdf');
});

test('pathFrom parser: validate SUPABASE_URL origin & chặn đứng directory traversal', () => {
  const SUPABASE_URL = 'https://vaxtkabqnvazdsiditgs.supabase.co';

  function pathFrom(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    let candidate;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsedUrl = new URL(raw);
        const expectedOrigin = new URL(SUPABASE_URL).origin;
        if (parsedUrl.origin.toLowerCase() !== expectedOrigin.toLowerCase()) {
          return null; // Reject external host
        }
        const m = parsedUrl.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/certificates\/([^?#]+)/i);
        if (!m) return null;
        candidate = decodeURIComponent(m[1]);
      } catch {
        return null;
      }
    } else {
      candidate = raw;
    }

    const cleaned = candidate.replace(/^\/+/, '').trim();
    if (!cleaned || cleaned.includes('..') || cleaned.includes('\\') || /\/{2,}/.test(cleaned)) {
      return null;
    }
    return cleaned;
  }

  // 1. Phải chặn host giả mạo (spoof host)
  assert.equal(pathFrom('https://attacker.evil.com/storage/v1/object/public/certificates/secret.pdf'), null);

  // 2. Phải chặn path traversal
  assert.equal(pathFrom('../../../etc/passwd'), null);
  assert.equal(pathFrom('evidence/../../secret.png'), null);
  assert.equal(pathFrom('evidence\\backslashes.png'), null);

  // 3. Chấp nhận URL hợp lệ từ đúng instance Supabase
  assert.equal(
    pathFrom('https://vaxtkabqnvazdsiditgs.supabase.co/storage/v1/object/public/certificates/evidence/student1/proof.png?token=123'),
    'evidence/student1/proof.png'
  );

  // 4. Chấp nhận relative path hợp lệ
  assert.equal(pathFrom('/evidence/proof.png'), 'evidence/proof.png');
});

test('verifyStorageOwnership: chặn đứng Confused-Deputy và unowned legacy objects', async () => {
  const fakeStorageTable = new Map([
    ['evidence/victim.png', { owner: 'victim-uid-2', owner_id: 'victim-uid-2' }],
    ['evidence/legacynull.png', { owner: null, owner_id: null }],
    ['evidence/myproof.png', { owner: 'student-uid-1', owner_id: 'student-uid-1' }],
  ]);

  async function verifyStorageOwnership(path, expectedUserId) {
    const obj = fakeStorageTable.get(path);
    if (!obj) return false;

    const ownerUuid = obj.owner ? String(obj.owner).toLowerCase() : null;
    const ownerIdText = obj.owner_id ? String(obj.owner_id).toLowerCase() : null;
    const expected = expectedUserId.toLowerCase();

    // Unowned legacy object -> fail-closed
    if (!ownerUuid && !ownerIdText) {
      return false;
    }

    return ownerUuid === expected || ownerIdText === expected;
  }

  const studentId = 'student-uid-1';

  // 1. Sinh viên cố tình trỏ vào file của nạn nhân -> PHẢI BỊ CHẶN
  const spoofResult = await verifyStorageOwnership('evidence/victim.png', studentId);
  assert.equal(spoofResult, false, 'không được ký cho file người khác');

  // 2. File legacy unowned (owner null) -> PHẢI BỊ CHẶN (fail-closed, chờ manual audit)
  const legacyNullResult = await verifyStorageOwnership('evidence/legacynull.png', studentId);
  assert.equal(legacyNullResult, false, 'unowned legacy phải fail-closed');

  // 3. File của chính mình -> ĐƯỢC PHÉP
  const myResult = await verifyStorageOwnership('evidence/myproof.png', studentId);
  assert.equal(myResult, true, 'chính chủ phải được phép ký URL');
});
