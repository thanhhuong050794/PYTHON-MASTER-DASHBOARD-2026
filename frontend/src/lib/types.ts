export type Breakdown = { key: string | null; count: number; web_registered: number; paid: number; revenue: number; name?: string };

export type ContactKpi = {
  total: number; web_registered: number; paid: number; revenue: number; unpaid_registered: number; unpaid_fees: number;
  leads_only: number; external: number; flagged: number; merged_records: number; free: number;
  paid_rate: number | null; potential_revenue: number;
  undated_contacts: number; undated_registrations: number; undated_paid: number;
};

export type TimelinePoint = {
  date: string; new_contacts: number; registrations: number; paid: number;
  cum_contacts: number; cum_registrations: number; cum_paid: number;
};

export type ContactSummary = {
  kpi: ContactKpi;
  funnel: { stage: string; value: number }[];
  timeline: TimelinePoint[];
  heatmap: { dow: number; hour: number; count: number }[];
  by_segment: Breakdown[]; by_drip: Breakdown[]; by_sub_segment: Breakdown[]; by_channel: Breakdown[];
  by_source_combo: Breakdown[]; by_source: Breakdown[]; by_region: Breakdown[]; by_province: Breakdown[];
  by_board: Breakdown[]; by_payment: Breakdown[]; by_pic: Breakdown[]; by_venue: Breakdown[];
  by_flag: { key: string; count: number }[];
};

export type ChannelRow = {
  channel: string; contacts: number; web_registered: number; unregistered: number; paid: number; revenue: number;
  conversion: number | null; assumed_contacts: number; budget_visible: boolean; budget: number | null; roi: number | null;
  cpa_lead: number | null; cpa_paid: number | null; cpa_active: number | null; clicks: number | null; ctr: number | null;
  active_candidates_assumed: number | null; is_assumed: boolean | null; data_note: string | null;
  original_report: { registrations: number | null; paid: number | null; revenue: number | null; roi: number | null; comment: string | null } | null;
};

export type MarketingSummary = {
  kpi: { contacts: number; web_registered: number; paid: number; revenue: number; budget: number | null; roi_program: number | null; roi_paid_channels: number | null; cpa_paid: number | null };
  channels: ChannelRow[];
  filtered: boolean;
};

export type StatRow = { key: string | boolean | null; count: number; avg: number | null; max: number | null; min: number | null; certificates: number; finalists: number; box: number[] | null; cert_rate: number | null };

export type ExamSummary = {
  kpi: { count: number; avg: number | null; max: number | null; min: number | null; finalists: number; final_avg: number | null; certificates: number; paid: number; cert_rate: number | null };
  params: { certificate_threshold: number; top_ratio: number; grade_excellent: number; grade_good: number; grade_average: number };
  structure: { board: string; round: string; round_label: string; level: string; section: string; section_label: string; max_score: number }[];
  datasets: { code: string; label: string; linked: boolean }[];
  by_board: StatRow[];
  final_by_board: { key: string; count: number; avg: number; max: number; min: number; certificates: number }[];
  histogram: { board: string; bin: number; count: number }[];
  grades: { board: string; round: string; grade: string; count: number }[];
  grade_order: string[];
  sections: { board: string; round: string; section: string; avg: number; count: number; max_score: number; pct: number }[];
  by_school: StatRow[]; by_school_type: StatRow[]; by_province: StatRow[]; by_region: StatRow[]; by_paid: StatRow[];
  finalists: { full_name: string; board: string; school: string; qualifier: number; final: number; final_rank: number }[];
};

export type Options = {
  partners: { code: string; name: string; type: string }[];
  viewing_partner: string | null;
  contacts?: {
    board: string[]; region: string[]; province: string[]; payment_status: string[];
    segment: { value: string; label: string }[]; channel: string[]; source: string[]; pic: string[]; venue: string[];
    date_min: string | null; date_max: string | null;
  };
  leads?: Record<"source" | "result" | "campaign" | "platform" | "segment" | "region" | "board" | "pic", string[]>;
  exams?: {
    datasets: { code: string; label: string }[]; board: string[]; region: string[]; province: string[];
    school_type: string[]; school: string[]; grade: string[];
  };
};
