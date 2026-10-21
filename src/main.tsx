import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  Map,
  CheckSquare,
  BookOpen,
  Settings,
  Plus,
  Search,
  Leaf,
  ArrowUpRight,
  ArrowRight,
  MoreHorizontal,
  Check,
  CalendarDays,
  Target,
  CloudOff,
  ShieldCheck,
  ChevronRight,
  Pencil,
  Archive,
  Trash2,
  Pin,
  Users,
  Download,
  Upload,
  AlertCircle,
  Clock,
  Undo2,
  RefreshCw,
  FileText,
  LockKeyhole,
  Bell,
  Sprout,
  X,
  CheckCircle2,
  Pause,
  Play,
  Eye,
} from "lucide-react";
import * as D from "./domain";
import { loadState, persistState, download, fromBase64 } from "./storage";
import { validateAttachments } from "./attachments";
import {
  encryptBackup,
  decryptBackup,
  recoveryCode,
  reviewMarkdown,
  observationsCsv,
} from "./backup";
import {
  Modal,
  Form,
  Field,
  Empty,
  Badge,
  Progress,
  Select,
  text,
} from "./components";
import {
  PersonForm,
  GoalForm,
  ActionForm,
  RecordForm,
  ReviewForm,
  horizons,
  metrics,
  repeats,
  type Save,
} from "./forms";
import "./style.css";

type Tab = "home" | "plans" | "actions" | "reviews";
type Panel =
  | { type: "person-form"; id?: string }
  | { type: "person"; id: string }
  | { type: "goal-form"; id?: string; personId: string }
  | { type: "goal"; id: string }
  | { type: "goal-stop"; id: string }
  | { type: "action-form"; personId: string; goalId?: string }
  | { type: "record"; personId: string; goalId?: string }
  | { type: "review-form"; personId: string; id?: string }
  | { type: "review"; id: string }
  | { type: "settings" }
  | { type: "backup" }
  | { type: "restore" }
  | { type: "recycle" }
  | { type: "sync" }
  | { type: "reschedule"; instance: D.Instance }
  | {
      type: "confirm";
      title: string;
      body: string;
      action: () => Promise<void>;
    };
const pct = (v: number | null) =>
  v === null ? "待补充" : Math.round(v * 100) + "%";
const statusNames: Record<D.GoalStatus, string> = {
  draft: "草稿",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  terminated: "已终止",
  archived: "已归档",
};
const periodNames = {
  week: "周复盘",
  month: "月复盘",
  quarter: "季度复盘",
  year: "年度复盘",
};
function initials(p: D.Person) {
  return [...p.name][0];
}
function dateLabel(date: string) {
  return date.slice(5).replace("-", "月") + "日";
}
function App() {
  const [state, setState] = useState<D.State | null>(null),
    [loadError, setLoadError] = useState(""),
    [tab, setTab] = useState<Tab>("home"),
    [selected, setSelected] = useState(""),
    [panel, setPanel] = useState<Panel | null>(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("custom"),
    [horizon, setHorizon] = useState("all"),
    [actionDate, setActionDate] = useState(D.localDate()),
    [actionFilter, setActionFilter] = useState("today");
  const stateRef = useRef<D.State | null>(null),
    saving = useRef(false);
  useEffect(() => {
    loadState()
      .then((s) => {
        stateRef.current = s;
        setState(s);
        setSelected(
          s.persons.find((p) => !p.deletedAt && !p.archivedAt)?.id ?? "",
        );
        window.BlueprintNative?.setPrivacy(s.settings.screenPrivacy);
      })
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onBack = () => {
      if (panel) setPanel(null);
      else if (tab !== "home") setTab("home");
      else window.BlueprintNative?.closeApp();
    };
    window.addEventListener("blueprint-back", onBack);
    return () => window.removeEventListener("blueprint-back", onBack);
  }, [panel, tab]);
  const save: Save = async (mutator, message = "已保存在本机") => {
    if (saving.current) throw new Error("正在保存，请稍候");
    const current = stateRef.current;
    if (!current) throw new Error("数据尚未加载");
    saving.current = true;
    try {
      const next = structuredClone(current);
      mutator(next);
      if (next.revision === current.revision) return;
      await persistState(next, current.revision);
      stateRef.current = next;
      setState(next);
      setToast(message);
    } finally {
      saving.current = false;
    }
  };
  const run = (fn: () => Promise<void>) => {
    void fn().catch((e) =>
      setToast(e instanceof Error ? e.message : "操作失败，请重试"),
    );
  };
  const close = () => setPanel(null);
  if (loadError)
    return (
      <main className="fatal">
        <ShieldCheck size={48} />
        <h1>数据需要安全恢复</h1>
        <p>{loadError}</p>
        <p>请保留此设备和应用数据，避免卸载导致设备密钥丢失。</p>
        <button className="button primary" onClick={() => location.reload()}>
          重新尝试
        </button>
      </main>
    );
  if (!state)
    return (
      <main className="fatal">
        <Leaf className="spin" />
        <p>打开你的成长蓝图…</p>
      </main>
    );
  const people = state.persons
    .filter((p) => !p.deletedAt && !p.archivedAt)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  const current = people.find((p) => p.id === selected) ?? people[0];
  const today = D.localDate(current?.timezone);
  const activeGoals = state.goals.filter(
    (g) => people.some((p) => p.id === g.personId) && g.status === "active",
  );
  const displayPeople = people
    .filter(
      (p) =>
        (p.name + p.relation + p.note).includes(query) &&
        (filter !== "pinned" || p.pinned) &&
        (filter !== "attention" ||
          state.goals.some(
            (g) =>
              g.personId === p.id &&
              [
                "需关注",
                "里程碑已逾期",
                "待更新",
                "进度待确认",
                "已超过截止日期",
              ].includes(
                D.goalAttention(state, g, D.localDate(p.timezone)) ?? "",
              ),
          )),
    )
    .sort((a, b) =>
      sort === "recent" ? b.updatedAt.localeCompare(a.updatedAt) : 0,
    );
  const confirm = (title: string, body: string, action: () => Promise<void>) =>
    setPanel({ type: "confirm", title, body, action });
  const goPerson = (p: D.Person, target: Tab) => {
    setSelected(p.id);
    setTab(target);
    close();
  };
  const newGoal = () =>
    current
      ? setPanel({ type: "goal-form", personId: current.id })
      : setPanel({ type: "person-form" });
  function card(p: D.Person) {
    const date = D.localDate(p.timezone),
      annual = D.annualProgress(state!, p.id, date.slice(0, 4)),
      summary = D.actionsSummary(state!, p.id, date),
      goals = state!.goals.filter(
        (g) => g.personId === p.id && g.status === "active",
      );
    const next = D.instancesOn(state!, p.id, date).find((i) => !i.done),
      nextAction = state!.actions.find((a) => a.id === next?.actionId);
    const last = state!.observations
      .filter((o) => o.personId === p.id)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    const reviewDue = !state!.reviews.some(
      (r) =>
        r.personId === p.id &&
        r.start === D.weekStart(date) &&
        r.status === "published",
    );
    return (
      <article className="person-card" key={p.id}>
        <div className="person-top">
          <button
            className="person-identity"
            onClick={() => setPanel({ type: "person", id: p.id })}
          >
            <span className={"avatar color-" + (p.order % 4)}>
              {initials(p)}
            </span>
            <span>
              <strong>
                {p.name}
                {p.pinned && <Pin size={12} />}
              </strong>
              <small>{p.relation}</small>
            </span>
          </button>
          <button
            className="icon-button subtle"
            aria-label={`管理${p.name}`}
            onClick={() => setPanel({ type: "person", id: p.id })}
          >
            <MoreHorizontal />
          </button>
        </div>
        <button className="direction" onClick={() => goPerson(p, "plans")}>
          {p.direction || "为想要的改变，找到一个方向"}
          <ArrowUpRight size={16} />
        </button>
        <button className="annual-block" onClick={() => goPerson(p, "plans")}>
          <div className="between">
            <span>
              {date.slice(0, 4)} 年度目标
              {annual.coverage < 1 && annual.progress !== null
                ? " · 已知进度"
                : ""}
            </span>
            <strong>{annual.total ? pct(annual.progress) : "待规划"}</strong>
          </div>
          <Progress value={annual.progress} />
          <small>
            {annual.total === 0
              ? "设置今年的重点，向前一步"
              : annual.coverage < 1
                ? `数据覆盖 ${Math.round(annual.coverage * 100)}% · 待补充`
                : `${annual.total} 个目标 · ${state!.settings.includeChallenges ? "包含挑战目标" : "仅基础目标"}`}
          </small>
        </button>
        <div className="card-facts">
          <button onClick={() => goPerson(p, "actions")}>
            <CheckSquare size={17} />
            <span>今日行动</span>
            <strong>
              {summary.total ? `${summary.done}/${summary.total}` : "未安排"}
            </strong>
          </button>
          <button onClick={() => goPerson(p, "reviews")}>
            <BookOpen size={17} />
            <span>{reviewDue ? "本周待复盘" : "本周已复盘"}</span>
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="next-line">
          <span className="mini-dot" />
          <span>
            {nextAction
              ? `下一步 · ${nextAction.title}`
              : goals.length
                ? "今天未安排，也可以休息"
                : "从一个近期目标开始"}
          </span>
        </div>
        {last && (
          <p className="latest">
            <Clock size={13} />
            <span>{last.text || "更新了成果指标"}</span>
            <small>
              {dateLabel(D.localDate(p.timezone, new Date(last.recordedAt)))}
            </small>
          </p>
        )}
        <div className="card-buttons">
          <button
            className="button soft"
            onClick={() => setPanel({ type: "record", personId: p.id })}
          >
            <Plus size={17} />
            记进展
          </button>
          <button className="button ghost" onClick={() => goPerson(p, "plans")}>
            看计划
            <ArrowRight size={16} />
          </button>
        </div>
      </article>
    );
  }
  const selector = (
    <Select
      label="当前人物"
      value={
        selected === "all" && (tab === "actions" || tab === "reviews")
          ? "all"
          : (current?.id ?? "")
      }
      onChange={(v) => {
        setSelected(v);
        setActionDate(
          D.localDate(state.persons.find((p) => p.id === v)?.timezone),
        );
      }}
    >
      {(tab === "actions" || tab === "reviews") && (
        <option value="all">全部人物</option>
      )}
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {p.relation}
        </option>
      ))}
    </Select>
  );
  function goalRow(g: D.Goal) {
    const progress = D.goalProgress(state!, g);
    const attention = D.goalAttention(
      state!,
      g,
      D.localDate(state!.persons.find((p) => p.id === g.personId)?.timezone),
    );
    return (
      <button
        className="goal-card"
        key={g.id}
        onClick={() => setPanel({ type: "goal", id: g.id })}
      >
        <div className="between">
          <span className="eyebrow">
            {g.domain} <span>· {horizons[g.horizon]}</span>
          </span>
          <Badge
            tone={
              g.status === "completed"
                ? "green"
                : attention === "需关注" || attention?.includes("逾期")
                  ? "amber"
                  : "neutral"
            }
          >
            {g.status === "active"
              ? (attention ?? "进行中")
              : statusNames[g.status]}
          </Badge>
        </div>
        <h3>{g.title}</h3>
        {g.parentId && (
          <p className="parent-line">
            关联方向 · {state!.goals.find((p) => p.id === g.parentId)?.title}
          </p>
        )}
        <div className="between goal-number">
          <span>
            {metrics[g.metric]}
            {g.challenge ? " · 挑战目标" : ""}
          </span>
          <strong>{pct(progress)}</strong>
        </div>
        <Progress value={progress} small />
        <div className="goal-bottom">
          <span>
            <CalendarDays size={14} />
            {dateLabel(g.end)}截止
          </span>
          <span>
            {g.weeklyMinutes} 分钟 / 周<ChevronRight size={14} />
          </span>
        </div>
      </button>
    );
  }
  function actionRow(i: D.Instance) {
    const a = state!.actions.find((a) => a.id === i.actionId)!;
    const p = state!.persons.find((p) => p.id === i.personId)!;
    const goal = state!.goals.find((g) => g.id === a.goalId);
    const blocked =
      a.paused ||
      ["paused", "terminated", "archived"].includes(goal?.status ?? "");
    return (
      <div className={"action-row " + (i.done ? "done" : "")} key={i.id}>
        <button
          aria-label={`${i.done ? "撤销" : "完成"}${a.title}`}
          className="task-check"
          disabled={blocked}
          aria-pressed={i.done}
          onClick={() =>
            run(() =>
              save(
                (s) => D.completeInstance(s, i, !i.done),
                i.done
                  ? "已撤销完成，修订记录已保留"
                  : "行动已完成，继续积累每一步",
              ),
            )
          }
        >
          {i.done && <Check size={18} />}
        </button>
        <div className="action-info">
          <strong>{a.title}</strong>
          <p>
            {goal?.title ?? "独立行动"} <span>· {a.minutes} 分钟</span>
          </p>
          <small>
            {p.name}{" "}
            {i.period.startsWith("week:")
              ? "· 本周次数，不提前判断逾期"
              : i.date < today
                ? "· 逾期待处理"
                : ""}
            {i.reschedules ? ` · 已改期 ${i.reschedules} 次` : ""}
            {blocked ? " · 已暂停" : ""}
          </small>
        </div>
        {!i.done && !i.period.startsWith("week:") && (
          <button
            className="icon-button subtle"
            aria-label={`改期${a.title}`}
            onClick={() => setPanel({ type: "reschedule", instance: i })}
          >
            <CalendarDays size={19} />
          </button>
        )}
      </div>
    );
  }
  function renderPanel() {
    if (!panel) return null;
    const st = state!;
    if (panel.type === "person-form")
      return (
        <Modal
          title={panel.id ? "编辑成长档案" : "添加成长档案"}
          onClose={close}
        >
          <PersonForm
            state={st}
            person={st.persons.find((p) => p.id === panel.id)}
            save={save}
            onDone={(id) => {
              setSelected(id);
              close();
            }}
          />
        </Modal>
      );
    if (panel.type === "goal-form")
      return (
        <Modal
          title={panel.id ? "调整目标" : "建立一个目标"}
          subtitle="方向可以很远，下一步可以很近"
          onClose={close}
        >
          <GoalForm
            state={st}
            personId={panel.personId}
            goal={st.goals.find((g) => g.id === panel.id)}
            save={save}
            onDone={close}
          />
        </Modal>
      );
    if (panel.type === "action-form")
      return (
        <Modal title="安排一个行动" onClose={close}>
          <ActionForm
            state={st}
            personId={panel.personId}
            goalId={panel.goalId}
            save={save}
            onDone={close}
          />
        </Modal>
      );
    if (panel.type === "record")
      return (
        <Modal title="记下新的进展" onClose={close}>
          <RecordForm
            state={st}
            personId={panel.personId}
            goalId={panel.goalId}
            save={save}
            onDone={close}
          />
        </Modal>
      );
    if (panel.type === "review-form")
      return (
        <Modal
          title={panel.id ? "编辑 / 修订复盘" : "给成长一次回望"}
          onClose={close}
        >
          <ReviewForm
            state={st}
            personId={panel.personId}
            previous={st.reviews.find((r) => r.id === panel.id)}
            save={save}
            onDone={close}
          />
        </Modal>
      );
    if (panel.type === "confirm")
      return (
        <Modal title={panel.title} onClose={close}>
          <p className="confirm-body">{panel.body}</p>
          <Form
            submit="确认继续"
            onSubmit={async () => {
              await panel.action();
              close();
            }}
          >
            <p className="muted">请确认操作范围后继续。</p>
          </Form>
        </Modal>
      );
    if (panel.type === "person") {
      const p = st.persons.find((p) => p.id === panel.id)!;
      const goals = st.goals.filter((g) => g.personId === p.id);
      const observations = st.observations
        .filter((o) => o.personId === p.id)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      return (
        <Modal
          title={p.name + "的成长档案"}
          subtitle={`${p.relation} · ${p.timezone}`}
          onClose={close}
        >
          <div className="profile-intro">
            <span className="avatar large">{initials(p)}</span>
            <h3>{p.direction || "每个人都有自己的成长节奏"}</h3>
            <p>{p.note || "还没有填写成长关注点"}</p>
          </div>
          <div className="stats three">
            <div>
              <strong>{goals.length}</strong>
              <span>成长目标</span>
            </div>
            <div>
              <strong>{observations.length}</strong>
              <span>进展记录</span>
            </div>
            <div>
              <strong>
                {
                  st.reviews.filter(
                    (r) => r.personId === p.id && r.status === "published",
                  ).length
                }
              </strong>
              <span>已发布复盘</span>
            </div>
          </div>
          <div className="button-grid">
            <button
              className="button soft"
              onClick={() => setPanel({ type: "person-form", id: p.id })}
            >
              <Pencil size={17} />
              编辑档案
            </button>
            <button
              className="button ghost"
              onClick={() =>
                run(() =>
                  save((s) => D.updatePerson(s, p.id, { pinned: !p.pinned })),
                )
              }
            >
              <Pin size={17} />
              {p.pinned ? "取消置顶" : "置顶人物"}
            </button>
            <button
              className="button ghost"
              onClick={() =>
                run(() =>
                  save((s) =>
                    D.updatePerson(s, p.id, {
                      order: Math.min(...s.persons.map((v) => v.order)) - 1,
                    }),
                  ),
                )
              }
            >
              <ArrowUpRight size={17} />
              移到最前
            </button>
            <button
              className="button ghost"
              onClick={() =>
                confirm(
                  "归档这个人物？",
                  "归档后从首页隐藏，历史记录保留，并暂停该人物的行动实例生成。可在设置中恢复。",
                  () => save((s) => D.setPersonState(s, p.id, "archive")),
                )
              }
            >
              <Archive size={17} />
              归档
            </button>
            <button
              className="button ghost danger"
              onClick={() =>
                confirm(
                  "移入回收站？",
                  `“${p.name}”的 ${goals.length} 个目标、${st.actions.filter((a) => a.personId === p.id).length} 个行动和相关记录将被隐藏，保留 30 天恢复窗口；到期后仍需你确认才会彻底删除。`,
                  () => save((s) => D.setPersonState(s, p.id, "delete")),
                )
              }
            >
              <Trash2 size={17} />
              删除档案
            </button>
          </div>
          <h3 className="section-heading">最近的成长足迹</h3>
          {observations.length ? (
            observations.slice(0, 30).map((o) => (
              <div className="timeline-row" key={o.id}>
                <span className="mini-dot" />
                <div>
                  <p>
                    {o.text || "更新成果指标"}
                    {o.value !== undefined && (
                      <Badge tone="green">
                        {o.value}{" "}
                        {o.unit ??
                          st.goals.find((g) => g.id === o.goalId)?.unit}
                      </Badge>
                    )}
                  </p>
                  <small>
                    {D.localDate(p.timezone, new Date(o.eventTime))} ·{" "}
                    {st.goals.find((g) => g.id === o.goalId)?.title ??
                      "成长心得"}
                    {o.recordedAt.slice(0, 10) !== o.eventTime.slice(0, 10)
                      ? " · 补录"
                      : ""}
                  </small>
                  <AttachmentFiles
                    state={st}
                    observationId={o.id}
                    save={save}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="muted">还没有进展记录，从一件小事开始。</p>
          )}
          <button
            className="button primary full"
            onClick={() => setPanel({ type: "record", personId: p.id })}
          >
            <Plus size={18} />为 {p.name} 记进展
          </button>
        </Modal>
      );
    }
    if (panel.type === "goal") {
      const g = st.goals.find((g) => g.id === panel.id)!;
      const p = st.persons.find((p) => p.id === g.personId)!;
      const progress = D.goalProgress(st, g);
      const value = D.currentValue(st, g);
      const observations = st.observations
        .filter((o) => o.goalId === g.id)
        .sort((a, b) => b.eventTime.localeCompare(a.eventTime));
      return (
        <Modal
          title="目标详情"
          subtitle={`所属人物：${p.name}`}
          onClose={close}
        >
          <div className="between">
            <Badge tone="green">
              {horizons[g.horizon]} · {g.domain}
            </Badge>
            <Badge>{statusNames[g.status]}</Badge>
          </div>
          <h2 className="detail-title">{g.title}</h2>
          <div className="detail-progress">
            <strong>{pct(progress)}</strong>
            <span>
              {metrics[g.metric]}
              {g.aggregation === "children" ? " · 按子目标汇总" : ""}
            </span>
            <Progress value={progress} />
          </div>
          <div className="detail-facts">
            <p>
              <span>目标周期</span>
              {g.start} ～ {g.end}
            </p>
            <p>
              <span>验收口径</span>
              {g.metric === "milestone"
                ? `${g.milestones.length} 个里程碑`
                : g.metric === "scale"
                  ? "五级量表"
                  : `基线 ${g.baseline} → 目标 ${g.target} ${g.unit}`}
            </p>
            <p>
              <span>最近数值</span>
              {value === null ? "待记录" : `${value} ${g.unit}`}
            </p>
            <p>
              <span>统计权重</span>
              {g.weight} · {g.challenge ? "挑战目标" : "基础目标"}
            </p>
            {g.parentId && (
              <p>
                <span>上一级目标</span>
                <button
                  className="text-button"
                  onClick={() => setPanel({ type: "goal", id: g.parentId! })}
                >
                  {st.goals.find((v) => v.id === g.parentId)?.title}
                  <ChevronRight size={15} />
                </button>
              </p>
            )}
          </div>
          {g.metric === "milestone" && (
            <div className="milestone-list">
              {g.milestones.map((m) => (
                <button
                  className={m.acceptedAt ? "accepted" : ""}
                  key={m.id}
                  onClick={() =>
                    run(() => save((s) => D.acceptMilestone(s, g.id, m.id)))
                  }
                >
                  <span className="task-check">
                    {m.acceptedAt && <Check size={16} />}
                  </span>
                  <span>
                    {m.title}
                    <small>
                      {m.date} · 权重 {m.weight}
                    </small>
                  </span>
                  <Badge tone={m.acceptedAt ? "green" : "neutral"}>
                    {m.acceptedAt ? "已验收" : "待验收"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          {st.conflicts
            .filter((c) => c.goalId === g.id && !c.resolved)
            .map((c) => (
              <div className="warning-box" key={c.id}>
                <strong>同一观察时点存在不同数值</strong>
                <p>请选择确认有效的记录，冲突数字不会进入汇总。</p>
                {c.observationIds.map((id) => {
                  const o = st.observations.find((o) => o.id === id)!;
                  return (
                    <button
                      className="button ghost"
                      key={id}
                      onClick={() =>
                        run(() =>
                          save((s) => D.resolveObservation(s, c.id, id)),
                        )
                      }
                    >
                      采用 {o.value} · {o.text || "无备注"}
                    </button>
                  );
                })}
              </div>
            ))}
          <div className="button-grid">
            {g.status === "draft" ? (
              <button
                className="button primary"
                onClick={() =>
                  run(() => save((s) => D.transitionGoal(s, g.id, "active")))
                }
              >
                <Play size={17} />
                确认并激活
              </button>
            ) : g.status === "active" ? (
              <>
                <button
                  className="button primary"
                  onClick={() =>
                    setPanel({
                      type: "record",
                      personId: g.personId,
                      goalId: g.id,
                    })
                  }
                >
                  <Plus size={17} />
                  记成果
                </button>
                {progress !== null && progress >= 1 && (
                  <button
                    className="button soft"
                    onClick={() =>
                      confirm(
                        "确认成果验收？",
                        "请确认成果已达到约定的验收标准；任务完成数量不会替代成果验收。",
                        () =>
                          save((s) => D.transitionGoal(s, g.id, "completed")),
                      )
                    }
                  >
                    <CheckCircle2 size={17} />
                    确认完成
                  </button>
                )}
                <button
                  className="button ghost"
                  onClick={() =>
                    setPanel({
                      type: "action-form",
                      personId: g.personId,
                      goalId: g.id,
                    })
                  }
                >
                  <CheckSquare size={17} />
                  安排下一步
                </button>
              </>
            ) : null}
            <button
              className="button ghost"
              onClick={() =>
                setPanel({ type: "goal-form", id: g.id, personId: g.personId })
              }
            >
              <Pencil size={17} />
              调整目标
            </button>
            {g.status === "active" && (
              <button
                className="button ghost"
                onClick={() =>
                  run(() => save((s) => D.transitionGoal(s, g.id, "paused")))
                }
              >
                <Pause size={17} />
                暂停推进
              </button>
            )}
            {g.status === "paused" && (
              <button
                className="button soft"
                onClick={() =>
                  confirm(
                    "恢复推进？",
                    `保留原截止日期 ${g.end}。如需顺延，请使用“调整目标”填写原因并生成新版本。`,
                    () => save((s) => D.transitionGoal(s, g.id, "active")),
                  )
                }
              >
                <Play size={17} />
                恢复推进
              </button>
            )}
            {g.status !== "draft" &&
              g.status !== "terminated" &&
              g.status !== "archived" && (
                <button
                  className="button ghost danger"
                  onClick={() => setPanel({ type: "goal-stop", id: g.id })}
                >
                  终止目标
                </button>
              )}
          </div>
          <details className="advanced">
            <summary>目标调整历史 · {g.versions.length} 个版本</summary>
            {[...g.versions].reverse().map((v) => (
              <div className="version-row" key={v.version}>
                <Badge>V{v.version}</Badge>
                <strong>{v.reason}</strong>
                <p>
                  {v.config.title} · 基线 {v.config.baseline} →{" "}
                  {v.config.target} · 权重 {v.config.weight}
                </p>
                <small>
                  {v.config.start} ～ {v.config.end} ·{" "}
                  {new Date(v.at).toLocaleString("zh-CN")}
                </small>
              </div>
            ))}
          </details>
          <h3 className="section-heading">成果与进展记录</h3>
          {observations.length ? (
            observations.slice(0, 30).map((o) => (
              <div className="timeline-row" key={o.id}>
                <span className="mini-dot" />
                <div>
                  <p>
                    {o.value !== undefined ? (
                      <strong>
                        {o.value} {o.unit ?? g.unit} ·{" "}
                      </strong>
                    ) : null}
                    {o.text || "更新指标"}
                  </p>
                  <small>
                    {new Date(o.eventTime).toLocaleString("zh-CN")}
                    {o.conflicted ? " · 待确认/未采用" : ""}
                  </small>
                  <AttachmentFiles
                    state={st}
                    observationId={o.id}
                    save={save}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="muted">还没有成果记录。</p>
          )}
        </Modal>
      );
    }
    if (panel.type === "goal-stop") {
      const g = st.goals.find((g) => g.id === panel.id)!;
      return (
        <Modal
          title="终止目标"
          subtitle={
            "所属人物：" + st.persons.find((p) => p.id === g.personId)?.name
          }
          onClose={close}
        >
          <p className="muted">
            保留已投入和历史成果；终止不自动移出年度统计。可在目标调整中修改统计范围。
          </p>
          <Form
            submit="确认终止"
            onSubmit={async (f) => {
              await save((s) =>
                D.transitionGoal(s, g.id, "terminated", text(f, "reason")),
              );
              close();
            }}
          >
            <Field label="终止原因">
              <textarea name="reason" required maxLength={1000} rows={3} />
            </Field>
          </Form>
        </Modal>
      );
    }
    if (panel.type === "reschedule")
      return (
        <Modal
          title="重新安排行动"
          subtitle={`所属人物：${st.persons.find((p) => p.id === panel.instance.personId)?.name}`}
          onClose={close}
        >
          <Form
            submit="确认改期"
            onSubmit={async (f) => {
              await save((s) =>
                D.rescheduleInstance(
                  s,
                  panel.instance,
                  text(f, "date"),
                  text(f, "reason"),
                ),
              );
              close();
            }}
          >
            <p>
              原计划日期：{panel.instance.originalDate}
              。改期会保留原日期与次数。
            </p>
            <Field label="新的计划日期">
              <input name="date" type="date" required defaultValue={today} />
            </Field>
            <Field label="改期原因">
              <textarea name="reason" required maxLength={1000} rows={2} />
            </Field>
          </Form>
        </Modal>
      );
    if (panel.type === "review") {
      const r = st.reviews.find((r) => r.id === panel.id)!;
      const p = st.persons.find((p) => p.id === r.personId)!;
      return (
        <Modal
          title={p.name + "的" + periodNames[r.period]}
          subtitle={`${r.start} ～ ${r.end} · 第 ${r.revision} 版`}
          onClose={close}
        >
          <Badge tone={r.status === "published" ? "green" : "neutral"}>
            {r.status === "published" ? "已发布 · 快照已冻结" : "草稿"}
          </Badge>
          <div className="fact-panel">
            <span>发布时的本期事实</span>
            <strong>
              {r.snapshot.completed}
              <small> / {r.snapshot.due} 项到期行动</small>
            </strong>
            {r.snapshot.goalProgress.map((g) => (
              <p key={g.id}>
                {g.title}
                <b>{pct(g.progress)}</b>
                <small> · 目标 V{g.version}</small>
              </p>
            ))}
          </div>
          {[
            ["最有价值的进展", r.wins],
            ["主要阻碍及原因", r.obstacles],
            ["保留或停止的方法", r.methods],
          ].map(([label, value]) => (
            <section key={label} className="review-section">
              <h3>{label}</h3>
              <p>{value || "未填写"}</p>
            </section>
          ))}
          <section className="review-section">
            <h3>下周期重点</h3>
            {r.next.length ? (
              r.next.map((t, i) => (
                <div className="next-review" key={i}>
                  <span>{i + 1}</span>
                  <p>{t}</p>
                  <button
                    className="text-button"
                    onClick={() =>
                      confirm(
                        "转为行动？",
                        `为“${p.name}”建立“${t}”，日期为 ${D.addDays(r.end, 1)}，不关联目标；你可在行动页继续排期。`,
                        () =>
                          save((s) => {
                            D.saveAction(s, {
                              id: D.uid(),
                              personId: p.id,
                              title: t,
                              date: D.addDays(r.end, 1),
                              minutes: 25,
                              paused: false,
                              repeat: {
                                kind: "once",
                                count: 1,
                                weekdays: [],
                                monthDay: 1,
                                interval: 1,
                                version: 1,
                              },
                              createdAt: D.now(),
                              updatedAt: D.now(),
                            });
                          }),
                      )
                    }
                  >
                    转为行动
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">这一次，留些空间给自己。</p>
            )}
          </section>
          <div className="button-grid">
            <button
              className="button primary"
              onClick={() =>
                setPanel({ type: "review-form", personId: p.id, id: r.id })
              }
            >
              <Pencil size={17} />
              {r.status === "published" ? "创建修订版" : "继续编辑"}
            </button>
            <button
              className="button ghost"
              onClick={() =>
                confirm(
                  "导出明文复盘？",
                  `文件包含“${p.name}”在 ${r.start} 至 ${r.end} 的复盘及目标名称；请妥善保管。`,
                  async () =>
                    download(
                      `成长复盘-${r.start}.md`,
                      "text/markdown",
                      new TextEncoder().encode(reviewMarkdown(r, p.name)),
                    ),
                )
              }
            >
              <Download size={17} />
              导出 Markdown
            </button>
            <button
              className="button ghost"
              onClick={() =>
                confirm(
                  "生成 PDF 阅读版？",
                  `将使用系统打印服务导出“${p.name}”的明文复盘，请在打印页选择“另存为 PDF”。`,
                  async () => {
                    const content = reviewMarkdown(r, p.name);
                    if (window.BlueprintNative)
                      window.BlueprintNative.openPrint(content);
                    else window.print();
                  },
                )
              }
            >
              <FileText size={17} />
              打印 / PDF
            </button>
          </div>
          <p className="muted small">
            统计时间 {new Date(r.snapshot.capturedAt).toLocaleString("zh-CN")} ·{" "}
            {r.snapshot.timezone} · 计算规则 {r.snapshot.calcVersion}
          </p>
        </Modal>
      );
    }
    if (panel.type === "backup")
      return (
        <Modal title="创建加密备份" onClose={close}>
          <BackupPanel state={st} />
        </Modal>
      );
    if (panel.type === "restore")
      return (
        <Modal title="从加密备份恢复" onClose={close}>
          <RestorePanel
            state={st}
            onRestore={async (imported) => {
              const base = stateRef.current!;
              imported.deviceId = D.uid();
              imported.revision = base.revision + 1;
              imported.operations.push({
                id: D.uid(),
                deviceId: imported.deviceId,
                seq: imported.revision,
                kind: "workspace.restore",
                entityId: imported.spaceId,
                at: D.now(),
                payload: { source: "encrypted-backup" },
              });
              await persistState(imported, base.revision);
              stateRef.current = imported;
              setState(imported);
              setSelected(
                imported.persons.find((p) => !p.deletedAt && !p.archivedAt)
                  ?.id ?? "",
              );
              setToast("备份已验证并恢复为当前空间");
              close();
            }}
          />
        </Modal>
      );
    if (panel.type === "sync")
      return (
        <Modal title="云盘与同步" onClose={close}>
          <div className="cloud-empty">
            <CloudOff size={40} />
            <h3>阿里云盘同步未开放</h3>
            <p>
              当前版本仅保存在本机。云盘功能需待应用审核与场景准入通过后接入。
            </p>
            <Badge tone="amber">尚未连接 · 未上传任何成长数据</Badge>
          </div>
          <div className="detail-facts">
            <p>
              <span>本地变更日志</span>
              {st.operations.length} 条
            </p>
            <p>
              <span>云端备份</span>尚无
            </p>
            <p>
              <span>多设备自动同步</span>暂不可用
            </p>
          </div>
          <div className="form-note">
            <ShieldCheck size={20} />
            现在可以创建加密备份，使用独立恢复码手动迁移。手动备份与云盘自动同步分别管理。
          </div>
          <button
            className="button primary full"
            onClick={() => setPanel({ type: "backup" })}
          >
            <Download size={18} />
            创建加密备份
          </button>
        </Modal>
      );
    if (panel.type === "recycle") {
      const deleted = st.persons.filter((p) => p.deletedAt),
        archived = st.persons.filter((p) => p.archivedAt && !p.deletedAt);
      return (
        <Modal title="归档与回收站" onClose={close}>
          <p className="muted">
            回收站默认保留 30 天，到期后也不会在未确认时自动清空。恢复保留原人物
            ID 与历史数据。
          </p>
          <h3 className="section-heading">已归档</h3>
          {archived.length ? (
            archived.map((p) => (
              <div className="list-row" key={p.id}>
                <span className="avatar small-avatar">{initials(p)}</span>
                <div>
                  <strong>{p.name}</strong>
                  <small>历史记录保留，未来行动暂停</small>
                </div>
                <button
                  className="button ghost"
                  onClick={() =>
                    run(() =>
                      save((s) => D.setPersonState(s, p.id, "unarchive")),
                    )
                  }
                >
                  取消归档
                </button>
              </div>
            ))
          ) : (
            <p className="muted">暂无归档人物</p>
          )}
          <h3 className="section-heading">回收站</h3>
          {deleted.length ? (
            deleted.map((p) => (
              <div className="trash-card" key={p.id}>
                <h3>{p.name}</h3>
                <p>
                  {p.deletedAt?.slice(0, 10)} 移入 ·{" "}
                  {st.goals.filter((g) => g.personId === p.id).length} 个目标 ·{" "}
                  {st.observations.filter((o) => o.personId === p.id).length}{" "}
                  条进展
                </p>
                <div className="button-grid">
                  <button
                    className="button soft"
                    onClick={() =>
                      run(() =>
                        save((s) => D.setPersonState(s, p.id, "restore")),
                      )
                    }
                  >
                    <Undo2 size={16} />
                    恢复
                  </button>
                  <button
                    className="button ghost danger"
                    onClick={() =>
                      confirm(
                        "彻底删除本机数据？",
                        `将永久清除“${p.name}”的本机档案、目标、行动、进展、复盘及相关日志。已导出或复制的备份仍可能包含该人物，需你自行清理；当前未连接云盘，无云端清理操作。此操作不可撤销。`,
                        () =>
                          save(
                            (s) => D.purgePerson(s, p.id),
                            "相关本机数据已清除；请自行检查外部备份",
                          ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                    彻底删除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">回收站是空的</p>
          )}
        </Modal>
      );
    }
    return (
      <Modal title="设置" subtitle="你的数据，由你掌握" onClose={close}>
        <div className="settings-group">
          <h3>数据与安全</h3>
          <button
            className="settings-row"
            onClick={() => setPanel({ type: "sync" })}
          >
            <CloudOff />
            <span>
              阿里云盘<span>未开放 · 仅保存在本机</span>
            </span>
            <ChevronRight />
          </button>
          <button
            className="settings-row"
            onClick={() => setPanel({ type: "backup" })}
          >
            <Download />
            <span>
              创建加密备份<span>独立恢复码保护完整空间</span>
            </span>
            <ChevronRight />
          </button>
          <button
            className="settings-row"
            onClick={() => setPanel({ type: "restore" })}
          >
            <Upload />
            <span>
              备份恢复<span>先验证，预览后确认替换</span>
            </span>
            <ChevronRight />
          </button>
          <button
            className="settings-row"
            onClick={() => setPanel({ type: "recycle" })}
          >
            <Archive />
            <span>
              归档与回收站<span>查看隐藏档案及待删除数据</span>
            </span>
            <ChevronRight />
          </button>
        </div>
        <div className="settings-group">
          <h3>隐私保护</h3>
          <label className="settings-row">
            <ShieldCheck />
            <span>
              遮挡截图与任务缩略图<span>Android 系统安全窗口保护</span>
            </span>
            <input
              type="checkbox"
              checked={st.settings.screenPrivacy}
              onChange={(e) => {
                const value = e.target.checked;
                run(async () => {
                  await save((s) =>
                    D.updateSettings(s, { screenPrivacy: value }),
                  );
                  window.BlueprintNative?.setPrivacy(value);
                });
              }}
            />
          </label>
          <p className="muted small">
            本机数据库中的成长内容使用 AES-256-GCM 加密，密钥由 Android Keystore
            保护。系统自动备份已关闭。卸载应用会丢失本机数据，请定期创建加密备份。
          </p>
        </div>
        <div className="settings-group">
          <h3>规划偏好</h3>
          <label className="settings-row">
            <Target />
            <span>
              年度统计包含挑战目标<span>默认只统计基础目标</span>
            </span>
            <input
              type="checkbox"
              checked={st.settings.includeChallenges}
              onChange={(e) => {
                const value = e.target.checked;
                confirm(
                  "调整年度统计范围？",
                  "更改将影响首页当前年度进度，已发布的复盘快照保持不变，并保存范围调整记录。",
                  () =>
                    save((s) =>
                      D.updateSettings(s, { includeChallenges: value }),
                    ),
                );
              }}
            />
          </label>
          <Form
            submit="保存规划偏好"
            onSubmit={async (f) =>
              save((s) =>
                D.updateSettings(s, {
                  domains: text(f, "domains")
                    .split("\n")
                    .map((d) => d.trim())
                    .filter(Boolean),
                  weeklyBudget: Number(text(f, "budget")),
                }),
              )
            }
          >
            <Field label="成长领域（每行一项）">
              <textarea
                name="domains"
                rows={4}
                defaultValue={st.settings.domains.join("\n")}
              />
            </Field>
            <Field label="每人每周时间预算（分钟）">
              <input
                name="budget"
                type="number"
                min="0"
                defaultValue={st.settings.weeklyBudget}
              />
            </Field>
          </Form>
        </div>
        <div className="settings-group">
          <h3>提醒</h3>
          <p className="muted">
            每日设备提醒，不包含个人正文。默认安静时段为 22:00 至次日
            08:00。当前设备为本地版唯一提醒设备。
          </p>
          <Form
            submit="设置每日提醒"
            onSubmit={async (f) => {
              const time = text(f, "time").split(":").map(Number);
              if (time[0] < 8 || time[0] >= 22)
                throw new Error("请选择安静时段之外的时间（08:00—21:59）");
              if (!window.BlueprintNative)
                throw new Error("请在 Android 应用内设置本地通知");
              const r = JSON.parse(
                window.BlueprintNative.scheduleReminder(time[0], time[1]),
              );
              if (!r.ok) throw new Error(r.message);
              setToast("每日提醒已设置；系统可能根据省电策略调整时间");
            }}
          >
            <Field label="提醒时间">
              <input name="time" type="time" defaultValue="20:30" required />
            </Field>
          </Form>
          <button
            className="text-button"
            onClick={() => {
              window.BlueprintNative?.cancelReminder();
              setToast("每日提醒已关闭");
            }}
          >
            关闭设备提醒
          </button>
        </div>
        {current && (
          <div className="settings-group">
            <h3>明文导出</h3>
            <button
              className="settings-row"
              onClick={() =>
                confirm(
                  "导出明文记录？",
                  `仅导出“${current.name}”的进展记录为 CSV，包含记录正文、目标名称和时间，请妥善保管。`,
                  async () =>
                    download(
                      "成长记录.csv",
                      "text/csv",
                      new TextEncoder().encode(observationsCsv(st, current.id)),
                    ),
                )
              }
            >
              <FileText />
              <span>
                导出 {current.name} 的记录
                <span>CSV 格式，已处理表格公式注入</span>
              </span>
              <ChevronRight />
            </button>
          </div>
        )}
        <footer className="about">
          <span className="brand-icon">
            <Leaf size={20} />
          </span>
          <strong>成长蓝图</strong>
          <p>1.0.0 · 本地版</p>
          <small>把长期方向，变成今天的一小步。</small>
        </footer>
      </Modal>
    );
  }
  return (
    <div className="app-shell">
      <aside className="desktop-rail" inert={!!panel}>
        <div className="rail-brand">
          <Leaf />
          <span>成长蓝图</span>
        </div>
        <p>让改变，慢慢发生。</p>
        <nav>
          {[
            ["home", Home, "首页"],
            ["plans", Map, "规划"],
            ["actions", CheckSquare, "行动"],
            ["reviews", BookOpen, "复盘"],
          ].map(([key, Icon, label]) => {
            const I = Icon as typeof Home;
            return (
              <button
                className={tab === key ? "active" : ""}
                key={key as string}
                onClick={() => setTab(key as Tab)}
              >
                <I size={21} />
                {label as string}
              </button>
            );
          })}
        </nav>
        <button
          className="rail-settings"
          onClick={() => setPanel({ type: "settings" })}
        >
          <Settings size={20} />
          设置与备份
        </button>
        <div className="rail-art">
          <Sprout size={36} />
          <p>
            不必急着抵达，
            <br />
            每一步都有意义。
          </p>
        </div>
      </aside>
      <div className="main-wrap" inert={!!panel}>
        <header className="app-header">
          <div>
            <p className="header-date">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
                timeZone: current?.timezone ?? "Asia/Shanghai",
              }).format(new Date())}
            </p>
            <h1>
              {tab === "home"
                ? "成长蓝图"
                : tab === "plans"
                  ? "把方向，写进计划"
                  : tab === "actions"
                    ? "今天，向前一步"
                    : "在回望中，找到方向"}
              {tab === "home" && (
                <span className="header-leaf">
                  <Leaf size={20} />
                </span>
              )}
            </h1>
          </div>
          <button
            className="icon-button settings-button"
            aria-label="设置"
            onClick={() => setPanel({ type: "settings" })}
          >
            <Settings size={23} />
          </button>
        </header>
        <button
          className="local-status"
          onClick={() => setPanel({ type: "sync" })}
        >
          <span className="status-dot" />
          <span>仅保存在本机</span>
          <ShieldCheck size={14} />
          <span className="status-end">
            云盘未连接
            <ChevronRight size={14} />
          </span>
        </button>
        {tab === "home" ? (
          <main className="page home-page">
            <div className="page-intro">
              <div>
                <h2>每个人的成长，都值得看见</h2>
                <p>关心方向，也关心今天的每一步。</p>
              </div>
              <span className="intro-graphic">
                <Sprout size={35} />
              </span>
            </div>
            {people.length > 0 && (
              <>
                <div className="overview-strip">
                  <div>
                    <Users size={18} />
                    <strong>{people.length}</strong>
                    <span>成长档案</span>
                  </div>
                  <div>
                    <Target size={18} />
                    <strong>{activeGoals.length}</strong>
                    <span>进行中目标</span>
                  </div>
                  <div>
                    <CheckCircle2 size={18} />
                    <strong>
                      {people.reduce(
                        (n, p) =>
                          n +
                          D.actionsSummary(state, p.id, D.localDate(p.timezone))
                            .done,
                        0,
                      )}
                    </strong>
                    <span>今日完成</span>
                  </div>
                </div>
                <div className="search-row">
                  <div className="search-input">
                    <Search size={18} />
                    <input
                      aria-label="搜索人物"
                      placeholder="找到你关心的人"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="清空搜索"
                        onClick={() => setQuery("")}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <Select label="人物排序" value={sort} onChange={setSort}>
                    <option value="custom">自定义顺序</option>
                    <option value="recent">最近更新</option>
                  </Select>
                </div>
                <div className="section-line">
                  <div className="chips">
                    {[
                      ["all", "全部人物"],
                      ["pinned", "已置顶"],
                      ["attention", "需要关注"],
                    ].map(([k, v]) => (
                      <button
                        className={filter === k ? "active" : ""}
                        key={k}
                        onClick={() => setFilter(k)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button desktop-add"
                    onClick={() => setPanel({ type: "person-form" })}
                  >
                    <Plus size={16} />
                    添加人物
                  </button>
                </div>
              </>
            )}
            {!people.length ? (
              <Empty
                icon={<Sprout size={43} />}
                title="从自己的成长开始"
                body="建立一个档案，写下想要的改变。你也可以为家人分别记录，按各自的节奏慢慢来。"
                button="建立我的成长档案"
                onClick={() => setPanel({ type: "person-form" })}
              />
            ) : (
              <>
                <div className="person-grid">{displayPeople.map(card)}</div>
                {!displayPeople.length && (
                  <Empty
                    icon={<Search size={30} />}
                    title="没有找到人物"
                    body="试试其他名字，或切换人物筛选。"
                  />
                )}
                <button
                  className="add-person"
                  onClick={() => setPanel({ type: "person-form" })}
                >
                  <span>
                    <Plus size={21} />
                  </span>
                  添加一个成长档案<small>关心自己，也陪伴家人</small>
                </button>
              </>
            )}
            <p className="home-footnote">
              <Leaf size={13} />
              成长有自己的时区，不必与谁比较。
            </p>
          </main>
        ) : !current ? (
          <main className="page">
            <Empty
              icon={<Users size={40} />}
              title="先认识这份蓝图的主人"
              body="添加一个档案后，就可以规划、记录行动和复盘。"
              button="建立成长档案"
              onClick={() => setPanel({ type: "person-form" })}
            />
          </main>
        ) : (
          <main className="page">
            <div className="workspace-head">
              {selector}
              <button
                className="text-button"
                onClick={() => setPanel({ type: "person", id: current.id })}
              >
                查看档案
                <ArrowUpRight size={15} />
              </button>
            </div>
            {tab === "plans" ? (
              <>
                <div className="plan-callout">
                  <div>
                    <span className="eyebrow">
                      {today.slice(0, 4)} · 让方向更清晰
                    </span>
                    <h2>{current.direction || "想要的未来，从一个目标开始"}</h2>
                    <p>长期方向不必一次想清，先找到一个可验证的成果。</p>
                  </div>
                  <button className="button primary" onClick={newGoal}>
                    <Plus size={18} />
                    建立目标
                  </button>
                </div>
                <div className="chips horizon-chips">
                  {[
                    ["all", "全部"],
                    ["long", "长期"],
                    ["year", "年度"],
                    ["quarter", "季度"],
                    ["custom", "近期"],
                  ].map(([k, v]) => (
                    <button
                      key={k}
                      className={horizon === k ? "active" : ""}
                      onClick={() => setHorizon(k)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {activeGoals
                  .filter((g) => g.personId === current.id)
                  .reduce((n, g) => n + g.weeklyMinutes, 0) >
                  state.settings.weeklyBudget && (
                  <div className="warning-box">
                    <Clock size={18} />
                    每周计划投入超过 {state.settings.weeklyBudget}{" "}
                    分钟的预算，考虑聚焦少量重点。
                  </div>
                )}
                <div className="goals-grid">
                  {state.goals
                    .filter(
                      (g) =>
                        g.personId === current.id &&
                        (horizon === "all" || g.horizon === horizon),
                    )
                    .map(goalRow)}
                </div>
                {!state.goals.some(
                  (g) =>
                    g.personId === current.id &&
                    (horizon === "all" || g.horizon === horizon),
                ) && (
                  <Empty
                    icon={<Map size={36} />}
                    title="给未来一个具体的方向"
                    body="你可以从长期、年度或近期目标开始，自由关联，无需填满所有层级。"
                    button="建立第一个目标"
                    onClick={newGoal}
                  />
                )}
                <div className="template-note">
                  <Leaf size={20} />
                  <div>
                    <strong>2026—2030 个人五年规划</strong>
                    <p>
                      选择“长期方向”，从实际建档日期起步；过去未记录的月份不会判为落后。
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="建立五年规划"
                    onClick={newGoal}
                  >
                    <Plus />
                  </button>
                </div>
              </>
            ) : tab === "actions" ? (
              <>
                <div className="page-title-row">
                  <div>
                    <h2>把注意力，放在下一步</h2>
                    <p>完成行动是投入，成果由你另行记录。</p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() =>
                      setPanel({ type: "action-form", personId: current.id })
                    }
                  >
                    <Plus size={18} />
                    {selected === "all"
                      ? "为" + current.name + "添加行动"
                      : "添加行动"}
                  </button>
                </div>
                <div className="action-toolbar">
                  <div className="chips">
                    {[
                      ["today", "今天"],
                      ["overdue", "逾期待处理"],
                      ["habits", "习惯"],
                    ].map(([k, v]) => (
                      <button
                        key={k}
                        className={actionFilter === k ? "active" : ""}
                        onClick={() => setActionFilter(k)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {actionFilter === "today" && (
                    <input
                      aria-label="查看行动日期"
                      type="date"
                      value={actionDate}
                      onChange={(e) => setActionDate(e.target.value)}
                    />
                  )}
                </div>
                {actionFilter === "habits" ? (
                  <div className="action-list">
                    {state.actions
                      .filter(
                        (a) =>
                          (selected === "all"
                            ? people.some((p) => p.id === a.personId)
                            : a.personId === current.id) &&
                          a.repeat.kind !== "once",
                      )
                      .map((a) => (
                        <div className="list-row" key={a.id}>
                          <span className="habit-icon">
                            <RefreshCw size={21} />
                          </span>
                          <div>
                            <strong>{a.title}</strong>
                            <small>
                              {repeats[a.repeat.kind]}{" "}
                              {a.repeat.kind === "weekly"
                                ? a.repeat.count + " 次"
                                : ""}{" "}
                              · {a.paused ? "已暂停" : "进行中"}
                            </small>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={(a.paused ? "恢复" : "暂停") + a.title}
                            onClick={() =>
                              run(() =>
                                save((s) => D.toggleActionPaused(s, a.id)),
                              )
                            }
                          >
                            {a.paused ? (
                              <Play size={18} />
                            ) : (
                              <Pause size={18} />
                            )}
                          </button>
                        </div>
                      ))}
                    {!state.actions.some(
                      (a) =>
                        a.personId === current.id && a.repeat.kind !== "once",
                    ) && (
                      <Empty
                        icon={<RefreshCw size={34} />}
                        title="用稳定的节奏积累"
                        body="添加每日、每周或自定义间隔的习惯。"
                        button="添加一个习惯"
                        onClick={() =>
                          setPanel({
                            type: "action-form",
                            personId: current.id,
                          })
                        }
                      />
                    )}
                  </div>
                ) : (
                  <>
                    {(selected === "all" ? people : [current]).map((p) => (
                      <section key={p.id}>
                        {selected === "all" && (
                          <h3 className="section-heading">{p.name}</h3>
                        )}
                        <ActionList
                          state={state}
                          person={p}
                          date={actionDate}
                          overdue={actionFilter === "overdue"}
                          row={actionRow}
                          onAdd={() =>
                            setPanel({ type: "action-form", personId: p.id })
                          }
                        />
                      </section>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="review-banner">
                  <span className="review-illustration">
                    <BookOpen size={35} />
                  </span>
                  <div>
                    <span className="eyebrow">暂停一下，看见改变</span>
                    <h2>投入是否带来了成长？</h2>
                    <p>看看事实，留下收获，再调整下一步。</p>
                  </div>
                </div>
                <div className="page-title-row">
                  <h2>我的复盘</h2>
                  <button
                    className="button primary"
                    onClick={() =>
                      setPanel({ type: "review-form", personId: current.id })
                    }
                  >
                    <Plus size={18} />
                    {selected === "all"
                      ? "为" + current.name + "复盘"
                      : "开始复盘"}
                  </button>
                </div>
                <div className="review-grid">
                  {state.reviews
                    .filter((r) =>
                      selected === "all"
                        ? people.some((p) => p.id === r.personId)
                        : r.personId === current.id,
                    )
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((r) => (
                      <button
                        className="review-card"
                        key={r.id}
                        onClick={() => setPanel({ type: "review", id: r.id })}
                      >
                        <div className="between">
                          <span className="review-icon">
                            <BookOpen size={20} />
                          </span>
                          <Badge
                            tone={
                              r.status === "published" ? "green" : "neutral"
                            }
                          >
                            {r.status === "published" ? "已发布" : "草稿"} · V
                            {r.revision}
                          </Badge>
                        </div>
                        <h3>
                          {selected === "all"
                            ? state.persons.find((p) => p.id === r.personId)
                                ?.name + " · "
                            : ""}
                          {periodNames[r.period]}
                        </h3>
                        <p>
                          {r.start} ～ {r.end}
                        </p>
                        <div className="review-preview">
                          {r.wins || r.obstacles || "留下一次有意义的回望"}
                        </div>
                        <div className="between">
                          <small>
                            {r.snapshot.completed}/{r.snapshot.due} 项行动 ·{" "}
                            {r.snapshot.observationIds.length} 条记录
                          </small>
                          <ArrowUpRight size={17} />
                        </div>
                      </button>
                    ))}
                </div>
                {!state.reviews.some((r) => r.personId === current.id) && (
                  <Empty
                    icon={<BookOpen size={36} />}
                    title="给努力留下一份回响"
                    body="不只问做了多少，也问什么有效。复盘可以很简短，一条收获就很好。"
                    button="写第一篇复盘"
                    onClick={() =>
                      setPanel({ type: "review-form", personId: current.id })
                    }
                  />
                )}
              </>
            )}
          </main>
        )}
        <nav className="bottom-nav" aria-label="主导航">
          {[
            ["home", Home, "首页"],
            ["plans", Map, "规划"],
            ["actions", CheckSquare, "行动"],
            ["reviews", BookOpen, "复盘"],
          ].map(([key, Icon, label]) => {
            const I = Icon as typeof Home;
            return (
              <button
                aria-current={tab === key ? "page" : undefined}
                className={tab === key ? "active" : ""}
                key={key as string}
                onClick={() => {
                  setTab(key as Tab);
                  window.scrollTo(0, 0);
                }}
              >
                <I size={23} />
                <span>{label as string}</span>
              </button>
            );
          })}
        </nav>
      </div>
      {renderPanel()}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function ActionList({
  state,
  person,
  date,
  overdue,
  row,
  onAdd,
}: {
  state: D.State;
  person: D.Person;
  date: string;
  overdue: boolean;
  row: (i: D.Instance) => React.ReactNode;
  onAdd: () => void;
}) {
  const today = D.localDate(person.timezone);
  let instances: D.Instance[] = [];
  if (overdue) {
    const start = state.actions
      .filter((a) => a.personId === person.id)
      .reduce((date, a) => (a.date < date ? a.date : date), today);
    const lower =
      start < D.addDays(today, -365) ? D.addDays(today, -365) : start;
    const seen = new Set<string>();
    for (let d = lower; d < today; d = D.addDays(d, 1))
      for (const i of D.instancesOn(state, person.id, d))
        if (i.date < today && !i.done && !seen.has(i.id)) {
          seen.add(i.id);
          instances.push(i);
        }
    for (const i of state.instances.filter(
      (i) =>
        i.personId === person.id && i.date < lower && !i.done && !i.cancelled,
    ))
      if (!seen.has(i.id)) instances.push(i);
  } else instances = D.instancesOn(state, person.id, date);
  const daily = instances.filter((i) => !i.period.startsWith("week:")),
    weekly = instances.filter((i) => i.period.startsWith("week:"));
  const done = daily.filter((i) => i.done).length;
  return (
    <>
      {!overdue && daily.length > 0 && (
        <div className="action-progress">
          <div className="between">
            <span>{date === today ? "今日" : dateLabel(date)}行动</span>
            <strong>
              已完成 {done}/{daily.length}
            </strong>
          </div>
          <Progress value={done / daily.length} small />
        </div>
      )}
      {daily.length > 0 && <div className="action-list">{daily.map(row)}</div>}
      {weekly.length > 0 && (
        <>
          <h3 className="section-heading">
            {overdue ? "已到期的周习惯" : "本周弹性习惯"}{" "}
            <Badge>
              {weekly.filter((i) => i.done).length}/{weekly.length}
            </Badge>
          </h3>
          <p className="muted small">
            整周安排，不把未来次数判为逾期；每天每个习惯最多完成一次。
          </p>
          <div className="action-list">{weekly.map(row)}</div>
        </>
      )}
      {!instances.length && (
        <Empty
          icon={overdue ? <CheckCircle2 size={35} /> : <Leaf size={35} />}
          title={overdue ? "没有逾期待处理的行动" : "今天未安排，也可以休息"}
          body={
            overdue
              ? "按自己的节奏，继续推进就好。"
              : "想向目标靠近一点？安排一个小而具体的行动。"
          }
          button={overdue ? undefined : "安排一个行动"}
          onClick={onAdd}
        />
      )}
      {overdue && (
        <p className="muted small">
          自动展开最近 365
          天的习惯实例；更早的已记录实例仍保留。重排日期保留原计划，不混入今日完成率。
        </p>
      )}
    </>
  );
}
function BackupPanel({ state }: { state: D.State }) {
  const [code] = useState(recoveryCode),
    [saved, setSaved] = useState(false);
  return (
    <Form
      submit="生成并保存加密文件"
      onSubmit={async () => {
        if (!saved) throw new Error("请先确认已单独保存恢复码");
        const bytes = await encryptBackup(state, code);
        download(
          `成长蓝图备份-${D.localDate()}.gbp`,
          "application/octet-stream",
          bytes,
        );
      }}
    >
      <div className="form-note">
        <LockKeyhole size={20} />
        包含全部人物、目标、行动、进展、复盘与版本历史。文件经过认证加密，不包含设备密钥。
      </div>
      <div className="backup-scope">
        <strong>{state.persons.length} 个档案</strong>
        <span>
          {state.goals.length} 个目标 · {state.observations.length} 条进展 ·{" "}
          {state.reviews.length} 篇复盘
        </span>
      </div>
      <Field
        label="此备份的独立恢复码"
        hint="长按复制并保存在文件之外的安全位置。恢复码无法由我们找回"
      >
        <textarea
          className="recovery-code"
          value={code}
          readOnly
          rows={2}
          onFocus={(e) => e.target.select()}
        />
      </Field>
      <div className="warning-box">
        <AlertCircle size={19} />
        <p>
          所有设备和恢复码都丢失时，备份内容无法恢复。请勿把恢复码与备份文件放在同一位置。
        </p>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        我已单独保存完整恢复码
      </label>
    </Form>
  );
}
function RestorePanel({
  state,
  onRestore,
}: {
  state: D.State;
  onRestore: (state: D.State) => Promise<void>;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null),
    [fileName, setFileName] = useState(""),
    [preview, setPreview] = useState<D.State | null>(null),
    [code, setCode] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      try {
        const detail = (event as CustomEvent).detail;
        if (detail.error) {
          setError(detail.error);
          return;
        }
        setBytes(fromBase64(detail.data));
        setFileName(detail.name);
        setPreview(null);
      } catch {
        setError("文件读取失败");
      }
    };
    window.addEventListener("blueprint-import", handler);
    return () => window.removeEventListener("blueprint-import", handler);
  }, []);
  return (
    <>
      <p className="muted">
        先解密并校验文件，再预览人物和记录数。确认前不会修改当前数据。
      </p>
      <Field label="选择加密备份文件">
        {window.BlueprintNative ? (
          <button
            className="button ghost"
            onClick={() => window.BlueprintNative!.importFile()}
          >
            <Upload size={18} />
            {fileName || "从设备选择 .gbp 文件"}
          </button>
        ) : (
          <input
            type="file"
            accept=".gbp,application/octet-stream"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 20 * 1024 * 1024) {
                setError("文件超过 20MB");
                return;
              }
              setBytes(new Uint8Array(await file.arrayBuffer()));
              setFileName(file.name);
              setPreview(null);
            }}
          />
        )}
      </Field>
      {fileName && <p className="muted">已选择 {fileName}</p>}
      <Form
        submit="校验并预览"
        onSubmit={async () => {
          if (!bytes) throw new Error("请先选择备份文件");
          const candidate = await decryptBackup(bytes, code);
          setPreview(candidate);
          setError("");
        }}
      >
        <Field label="输入完整恢复码">
          <textarea
            rows={2}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setPreview(null);
            }}
            placeholder="备份时单独保存的 43 位恢复码"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
      </Form>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="restore-preview">
          <Badge tone="green">
            <ShieldCheck size={14} />
            认证校验通过
          </Badge>
          <h3>恢复预览</h3>
          <p>
            {preview.persons.length} 个档案 · {preview.goals.length} 个目标 ·{" "}
            {preview.observations.length} 条进展 · {preview.reviews.length}{" "}
            篇复盘
          </p>
          <p className="muted">
            档案：{preview.persons.map((p) => p.name).join("、") || "空空间"}
          </p>
          <div className="warning-box">
            确认后将以备份空间替换当前 {state.persons.length}{" "}
            个档案的空间。当前数据不会自动合并，请先导出当前空间备份。
          </div>
          <Form
            submit="确认恢复此空间"
            onSubmit={async () => {
              if (!confirmed) throw new Error("请先确认已备份当前空间");
              await onRestore(structuredClone(preview));
            }}
          >
            <label className="check-row">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已备份当前空间，并确认切换到预览的空间
            </label>
          </Form>
        </div>
      )}
    </>
  );
}
function AttachmentFiles({
  state,
  observationId,
  save,
}: {
  state: D.State;
  observationId: string;
  save: Save;
}) {
  const [error, setError] = useState("");
  return (
    <div className="attachment-files">
      {state.attachments
        .filter((a) => a.observationId === observationId)
        .map((a) => (
          <div key={a.id}>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await validateAttachments([a]);
                  download(a.name, a.mime, fromBase64(a.data));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Download size={14} />
              导出 {a.name}（{Math.ceil(a.size / 1024)}KB）
            </button>
            <button
              className="text-button danger"
              aria-label={"删除附件" + a.name}
              onClick={async () => {
                try {
                  await save(
                    (s) => D.removeAttachment(s, a.id),
                    "本机附件已移除，外部备份需自行清理",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
