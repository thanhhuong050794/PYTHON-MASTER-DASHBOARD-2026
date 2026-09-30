import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout, NAV } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { ScopeContext } from "./lib/hooks";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import Contacts from "./pages/Contacts";
import Exams from "./pages/Exams";
import Leads from "./pages/Leads";
import Login from "./pages/Login";
import Marketing from "./pages/Marketing";
import Overview from "./pages/Overview";
import Quality from "./pages/Quality";
import Sponsorship from "./pages/Sponsorship";

const PAGES: Record<string, { title: string; el: ReactNode }> = {
  overview: { title: "Tổng quan", el: <Overview /> },
  contacts: { title: "CRM & phễu tuyển sinh", el: <Contacts /> },
  marketing: { title: "Kênh truyền thông & ROI", el: <Marketing /> },
  leads: { title: "Lead Talkshow & Facebook", el: <Leads /> },
  exams: { title: "Kết quả thi", el: <Exams /> },
  sponsorship: { title: "Nhà tài trợ & truyền thông", el: <Sponsorship /> },
  quality: { title: "Chất lượng dữ liệu", el: <Quality /> },
  admin: { title: "Quản trị & phân quyền", el: <Admin /> },
};

function Guarded() {
  const { user, ready } = useAuth();
  const [partner, setPartnerState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("neu-bi-scope");
    } catch {
      return null;
    }
  });
  const setPartner = (p: string | null) => {
    setPartnerState(p);
    try {
      if (p) sessionStorage.setItem("neu-bi-scope", p);
      else sessionStorage.removeItem("neu-bi-scope");
    } catch {
      /* bỏ qua */
    }
  };
  useEffect(() => {
    if (user && user.role !== "admin") setPartnerState(null);
  }, [user]);

  if (!ready) return <div className="empty">Đang tải…</div>;
  if (!user) return <Login />;
  const first = NAV.find((n) => user.modules.includes(n.module));
  return (
    <ScopeContext.Provider value={{ partner: user.role === "admin" ? partner : null, setPartner }}>
      <Routes>
        {NAV.filter((n) => user.modules.includes(n.module)).map((n) => (
          <Route key={n.path} path={n.path} element={<Layout title={PAGES[n.module].title}>{PAGES[n.module].el}</Layout>} />
        ))}
        <Route path="/tai-khoan" element={<Layout title="Đổi mật khẩu"><Account /></Layout>} />
        <Route path="*" element={<Navigate to={first?.path ?? "/tai-khoan"} replace />} />
      </Routes>
    </ScopeContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Guarded />
      </BrowserRouter>
    </AuthProvider>
  );
}
