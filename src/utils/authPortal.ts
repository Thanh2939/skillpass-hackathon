export type AuthPortal = 'student' | 'business' | 'admin' | 'recipient';
export type AccountRole = 'student' | 'business' | 'admin';

/** UX boundary only; database policies remain the authority for authorization. */
export function portalError(role: AccountRole, portal?: AuthPortal): string | null {
  if (!portal || portal === 'recipient' || role === portal) return null;
  if (role === 'admin') return 'Tài khoản nhân viên phải đăng nhập tại cổng nội bộ SkillPass.';
  if (portal === 'admin') return 'Tài khoản này không có quyền quản trị SkillPass.';
  return portal === 'business' ? 'Vui lòng dùng tài khoản trường học hoặc doanh nghiệp.' : 'Vui lòng dùng tài khoản sinh viên.';
}
