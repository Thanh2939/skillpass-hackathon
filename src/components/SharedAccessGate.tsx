import React, { useState } from 'react';
import { Button, Note, TextField } from './ui';
import { useApp } from '../store/AppContext';

/** Receiver authentication stays on the shared link; never redirects into a student wallet. */
export function SharedAccessGate({ status, onRetry }: { status: string; onRetry: () => void }) {
  const { authUser, signIn, signOut } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = async () => {
    if (busy) return;
    if (!email.trim() || !password) { setError('Vui lòng nhập email và mật khẩu người nhận.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await signIn(email, password, 'recipient');
      if (result.ok) onRetry();
      else setError(result.error || 'Không đăng nhập được.');
    } finally { setBusy(false); }
  };
  const needsLogin = status === 'login_required' || status === 'denied';
  return (
    <>
      <Note biz tone={needsLogin ? 'info' : 'bad'} title={status === 'denied' ? 'Không có quyền xem hồ sơ' : status === 'login_required' ? 'Liên kết chỉ dành cho người nhận' : 'Không mở được hồ sơ'}>
        {needsLogin ? 'Đăng nhập bằng tài khoản có email đã xác thực và được người chia sẻ chỉ định. Nếu chưa có tài khoản, hãy đăng ký và xác nhận email, sau đó mở lại liên kết này.' : status === 'revoked' || status === 'expired' ? 'Liên kết đã được thu hồi hoặc hết hạn. Vui lòng yêu cầu chủ hồ sơ gửi liên kết mới.' : status === 'not_found' ? 'Liên kết hoặc chứng chỉ không tồn tại trong phạm vi chia sẻ này.' : 'Không kết nối được dịch vụ chia sẻ. Vui lòng thử lại; dữ liệu không được mở khi chưa kiểm tra quyền.'}
      </Note>
      {needsLogin ? <>
        {authUser ? <Button biz variant="ghost" disabled={busy} title={`Đổi tài khoản (${authUser.email})`} onPress={async () => { setBusy(true); try { await signOut(); onRetry(); } finally { setBusy(false); } }} /> : null}
        <TextField label="Email người nhận" value={email} onChangeText={setEmail} placeholder="Email đã được chỉ định" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Mật khẩu tài khoản" secureTextEntry />
        {error ? <Note biz tone="bad" title="Không thể đăng nhập">{error}</Note> : null}
        <Button biz title={busy ? 'Đang kiểm tra...' : 'Đăng nhập để xem hồ sơ'} disabled={busy} onPress={login} />
      </> : null}
      <Button biz variant="ghost" title="Kiểm tra lại quyền truy cập" onPress={onRetry} disabled={busy} />
    </>
  );
}
