import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

const PARTNERS = [
  { code: "DN", name: "Doanh nghiệp" },
  { code: "THPT", name: "Trường THPT" },
  { code: "DH", name: "Trường Đại học" },
  { code: "INFO", name: "Đối tác trường (info)" },
  { code: "METAADS", name: "Meta Ads" },
  { code: "MIENNAM", name: "Khu vực miền Nam" },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>
          </div>
          <div>
            <div className="brand-title">NEU Admissions BI</div>
            <div className="brand-sub">Tuyển sinh Python Master</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <h1>Theo dõi tuyển sinh, kênh truyền thông và kết quả thi trên một màn hình.</h1>
          <p>Mỗi đối tác đăng nhập bằng tài khoản riêng và chỉ thấy dữ liệu thuộc phạm vi của mình. Quản trị viên quản lý toàn bộ hệ thống.</p>
          <div className="partner-list">
            {PARTNERS.map((p) => <div key={p.code}><b>{p.code}</b>{p.name}</div>)}
          </div>
        </div>
        <div className="login-bars" aria-hidden>
          {[34, 52, 44, 70, 62, 88, 80, 100].map((h, i) => <span key={i} style={{ height: `${h}%`, opacity: 0.35 + i * 0.08 }} />)}
        </div>
      </section>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div>
            <h2>Đăng nhập</h2>
            <p className="text-2" style={{ margin: "4px 0 0" }}>Dùng tài khoản được quản trị viên cấp.</p>
          </div>
          <label className="field">
            <span>Tên đăng nhập</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn primary" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
        </form>
      </div>
    </div>
  );
}
