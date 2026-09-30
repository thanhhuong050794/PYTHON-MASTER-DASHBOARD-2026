import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setMsg({ ok: false, text: "Mật khẩu nhập lại không khớp" });
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", json: { current_password: current, new_password: next } });
      setMsg({ ok: true, text: "Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <section className="card col-6">
        <div className="card-head"><div><h2>Đổi mật khẩu</h2><div className="sub">Tài khoản @{user?.username}</div></div></div>
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Mật khẩu hiện tại</span><input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></label>
          <label className="field"><span>Mật khẩu mới (≥ 8 ký tự, gồm chữ và số/ký tự đặc biệt)</span><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <label className="field"><span>Nhập lại mật khẩu mới</span><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
          {msg && <div className={msg.ok ? "badge good" : "error"} role="status">{msg.text}</div>}
          <div><button className="btn primary" disabled={busy}>Lưu mật khẩu</button></div>
        </form>
      </section>
      <section className="card col-6">
        <div className="card-head"><div><h2>Quyền truy cập</h2></div></div>
        <dl className="kv">
          <dt>Vai trò</dt><dd>{user?.role === "admin" ? "Quản trị viên" : "Đối tác"}</dd>
          {user?.partner_code && (<><dt>Đối tác</dt><dd>{user.partner_code} · {user.partner_name}</dd></>)}
          <dt>Xem thông tin cá nhân</dt><dd>{user?.can_view_pii ? "Có" : "Không — email/SĐT được che"}</dd>
          <dt>Mục được xem</dt><dd>{user?.modules.join(", ")}</dd>
        </dl>
      </section>
    </div>
  );
}
