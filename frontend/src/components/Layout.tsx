import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useApi, useScope } from "../lib/hooks";
import { applyThemeMode, getThemeMode, type ThemeMode } from "../lib/theme";
import { Icon } from "./Icons";

export const NAV = [
  { path: "/", module: "overview", label: "Tổng quan", icon: Icon.overview },
  { path: "/crm", module: "contacts", label: "CRM & phễu tuyển sinh", icon: Icon.contacts },
  { path: "/kenh-roi", module: "marketing", label: "Kênh & ROI", icon: Icon.marketing },
  { path: "/lead", module: "leads", label: "Lead Talkshow & FB", icon: Icon.leads },
  { path: "/diem-thi", module: "exams", label: "Kết quả thi", icon: Icon.exams },
  { path: "/tai-tro", module: "sponsorship", label: "Nhà tài trợ & truyền thông", icon: Icon.sponsorship },
  { path: "/chat-luong", module: "quality", label: "Chất lượng dữ liệu", icon: Icon.quality },
  { path: "/quan-tri", module: "admin", label: "Quản trị & phân quyền", icon: Icon.admin },
];

const THEME_NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };
const THEME_LABEL: Record<ThemeMode, string> = { system: "Theo hệ thống", light: "Sáng", dark: "Tối" };

function ScopeSelect() {
  const { partner, setPartner } = useScope();
  const { data } = useApi<{ partners: { code: string; name: string }[] }>("/meta/options");
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>Phạm vi dữ liệu</span>
      <select className="select" value={partner ?? ""} onChange={(e) => setPartner(e.target.value || null)} aria-label="Xem theo phạm vi đối tác">
        <option value="">Toàn hệ thống</option>
        {data?.partners.map((p) => (
          <option key={p.code} value={p.code}>{p.code} · {p.name}</option>
        ))}
      </select>
    </label>
  );
}

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    document.title = `${title} · NEU Admissions BI`;
  }, [title]);

  const cycleTheme = () => {
    const next = THEME_NEXT[theme];
    applyThemeMode(next);
    setTheme(next);
  };
  const ThemeIcon = theme === "dark" ? Icon.moon : theme === "light" ? Icon.sun : Icon.monitor;

  if (!user) return null;
  const nav = NAV.filter((n) => user.modules.includes(n.module));

  return (
    <div className="app">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Điều hướng">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>
          </div>
          <div>
            <div className="brand-title">NEU Admissions BI</div>
            <div className="brand-sub">Tuyển sinh Python Master · PTIT</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-label">Dashboard</div>
          {nav.filter((n) => n.module !== "admin").map((n) => (
            <NavLink key={n.path} to={n.path} end={n.path === "/"}>
              <n.icon />{n.label}
            </NavLink>
          ))}
          {user.role === "admin" && (
            <>
              <div className="nav-label">Hệ thống</div>
              <NavLink to="/quan-tri"><Icon.admin />Quản trị & phân quyền</NavLink>
            </>
          )}
          <div className="nav-label">Tài khoản</div>
          <NavLink to="/tai-khoan"><Icon.account />Đổi mật khẩu</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <b>{user.full_name}</b>
            <span className="muted" style={{ fontSize: 12.5 }}>@{user.username}</span>
            <span>
              {user.role === "admin" ? <span className="badge accent">Quản trị viên</span> : <span className="badge accent">{user.partner_code} · {user.partner_name}</span>}
            </span>
          </div>
          <div className="row">
            <button className="btn sm" onClick={cycleTheme} title={`Giao diện: ${THEME_LABEL[theme]}`}>
              <ThemeIcon /> {THEME_LABEL[theme]}
            </button>
            <button className="btn sm ghost" onClick={logout}><Icon.logout /> Đăng xuất</button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost sm menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Mở menu"><Icon.menu /></button>
          <h1>{title}</h1>
          <div className="spacer" />
          {user.role === "admin" && loc.pathname !== "/quan-tri" && loc.pathname !== "/tai-khoan" && <ScopeSelect />}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
