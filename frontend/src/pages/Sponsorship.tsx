import { Icon } from "../components/Icons";
import { Note, StatTile } from "../components/ChartCard";
import { SimpleBarCard } from "../components/Viz";
import { qs } from "../lib/api";
import { fmtInt, fmtNum, fmtPct } from "../lib/format";
import { useApi, useScope } from "../lib/hooks";

type Benefit = { item: string; status: string; progress: number; placement: string; schedule: string; note: string };
type Reach = { channel: string; reach: number; engagement: number; engagement_rate: number; importance: number };

function StatusBadge({ progress }: { progress: number }) {
  if (progress >= 1) return <span className="badge good"><Icon.good /> Hoàn thành</span>;
  if (progress > 0) return <span className="badge warn"><Icon.pending /> Đang thực hiện</span>;
  return <span className="badge"><Icon.notStarted /> Chưa bắt đầu</span>;
}

export default function Sponsorship() {
  const { partner } = useScope();
  const { data, loading, error } = useApi<{ benefits: Benefit[]; reach: Reach[] }>(`/sponsorship/summary${qs({ partner })}`);
  const benefits = data?.benefits ?? [];
  const reach = (data?.reach ?? []).map((r) => ({ ...r, key: r.channel, count: r.reach }));
  const done = benefits.filter((b) => b.progress >= 1).length;
  const avg = benefits.length ? benefits.reduce((a, b) => a + b.progress, 0) / benefits.length : null;

  return (
    <>
      <p className="page-desc">Theo dõi quyền lợi cam kết với nhà tài trợ và hiệu quả các kênh truyền thông của chương trình.</p>
      {error && <Note warn>{error}</Note>}
      {data && (
        <>
          <div className={`kpis${loading ? " loading-dim" : ""}`}>
            <StatTile label="Tiến độ quyền lợi" value={fmtPct(avg, 0)} hint={`${done}/${benefits.length} hạng mục hoàn thành`} />
            <StatTile label="Tổng lượt tiếp cận" value={fmtInt(reach.reduce((a, r) => a + r.reach, 0))} />
            <StatTile label="Tổng lượt tương tác" value={fmtInt(reach.reduce((a, r) => a + r.engagement, 0))} />
          </div>
          <div className="grid">
            <section className="card col-12">
              <div className="card-head"><div><h2>Quyền lợi nhà tài trợ</h2><div className="sub">Thanh tiến độ theo tình trạng hoàn thành trong báo cáo</div></div></div>
              {benefits.map((b) => (
                <div className="benefit" key={b.item}>
                  <div>
                    <b>{b.item}</b>
                    <div className="text-2" style={{ fontSize: 13 }}>{b.placement} · {b.schedule}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{b.note}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <StatusBadge progress={b.progress} />
                    <div className="num" style={{ fontWeight: 600, marginTop: 4 }}>{fmtPct(b.progress, 0)}</div>
                  </div>
                  <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(b.progress * 100)} aria-label={b.item}>
                    <div style={{ width: `${Math.max(b.progress * 100, 0)}%` }} />
                  </div>
                </div>
              ))}
            </section>
            <SimpleBarCard title="Lượt tiếp cận theo kênh" rows={reach} valueLabel="Reach" keyLabel="Kênh" loading={loading} />
            <SimpleBarCard title="Lượt tương tác theo kênh" rows={reach} value={(r) => r.engagement} valueLabel="Engagement" keyLabel="Kênh" loading={loading} />
            <SimpleBarCard title="Tỉ lệ tương tác" sub="Engagement ÷ Reach" rows={reach} value={(r) => r.engagement_rate} fmt={(v) => fmtPct(v, 1)} valueLabel="Tỉ lệ" keyLabel="Kênh" loading={loading} />
            <SimpleBarCard title="Mức độ quan trọng (khảo sát 1–5)" rows={reach} value={(r) => r.importance} fmt={(v) => fmtNum(v, 1)} valueLabel="Điểm" keyLabel="Kênh" loading={loading} />
          </div>
        </>
      )}
    </>
  );
}
