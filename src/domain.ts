export const SCHEMA = 1;
export const CALC_VERSION = "1.0";
export const DEFAULT_DOMAINS = [
  "职业与事业",
  "知识与技能",
  "健康与生活",
  "家庭与关系",
  "财务习惯",
  "兴趣与创造",
];
export type Horizon = "long" | "year" | "quarter" | "custom";
export type Metric =
  | "increase"
  | "decrease"
  | "milestone"
  | "frequency"
  | "scale";
export type GoalStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "terminated"
  | "archived";
export type RepeatKind =
  | "once"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "interval";
export interface Person {
  id: string;
  name: string;
  relation: string;
  note: string;
  direction: string;
  timezone: string;
  pinned: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  deletedAt?: string;
  consent: boolean;
}
export interface Milestone {
  id: string;
  title: string;
  weight: number;
  date: string;
  acceptedAt?: string;
}
export interface GoalConfig {
  title: string;
  horizon: Horizon;
  domain: string;
  start: string;
  end: string;
  metric: Metric;
  baseline: number;
  target: number;
  unit: string;
  weight: number;
  challenge: boolean;
  includedInAnnual: boolean;
  measurement: "latest" | "delta";
  parentId?: string;
  aggregation: "self" | "children";
  weeklyMinutes: number;
  cadence: "linear" | "none";
  freshnessDays: number;
  scaleLabels: string[];
}
export interface GoalVersion {
  version: number;
  at: string;
  reason: string;
  config: GoalConfig;
  milestones: Milestone[];
}
export interface Goal extends GoalConfig {
  id: string;
  personId: string;
  status: GoalStatus;
  milestones: Milestone[];
  versions: GoalVersion[];
  createdAt: string;
  updatedAt: string;
}
export interface Repeat {
  kind: RepeatKind;
  weekdays: number[];
  count: number;
  monthDay: number;
  interval: number;
  version: number;
}
export interface Action {
  id: string;
  personId: string;
  goalId?: string;
  title: string;
  date: string;
  end?: string;
  minutes: number;
  repeat: Repeat;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Instance {
  id: string;
  actionId: string;
  personId: string;
  ruleVersion: number;
  date: string;
  originalDate: string;
  period: string;
  done: boolean;
  completedAt?: string;
  cancelled: boolean;
  reschedules: number;
}
export interface Observation {
  id: string;
  personId: string;
  goalId?: string;
  text: string;
  value?: number;
  eventTime: string;
  recordedAt: string;
  supersedesId?: string;
  conflicted?: boolean;
  goalVersion?: number;
  unit?: string;
}
export interface Attachment {
  id: string;
  personId: string;
  observationId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  data: string;
}
export interface ReviewSnapshot {
  calcVersion: string;
  timezone: string;
  capturedAt: string;
  start: string;
  end: string;
  completed: number;
  due: number;
  goalProgress: {
    id: string;
    title: string;
    version: number;
    progress: number | null;
  }[];
  observationIds: string[];
}
export interface Review {
  id: string;
  personId: string;
  period: "week" | "month" | "quarter" | "year";
  start: string;
  end: string;
  wins: string;
  obstacles: string;
  methods: string;
  next: string[];
  status: "draft" | "published";
  revision: number;
  previousId?: string;
  snapshot: ReviewSnapshot;
  createdAt: string;
}
export interface Operation {
  id: string;
  deviceId: string;
  seq: number;
  kind: string;
  entityId: string;
  personId?: string;
  at: string;
  payload: unknown;
}
export interface Conflict {
  id: string;
  goalId: string;
  observationIds: string[];
  resolved: boolean;
}
export interface State {
  schemaVersion: number;
  revision: number;
  spaceId: string;
  deviceId: string;
  persons: Person[];
  goals: Goal[];
  actions: Action[];
  instances: Instance[];
  observations: Observation[];
  attachments: Attachment[];
  reviews: Review[];
  operations: Operation[];
  conflicts: Conflict[];
  settings: {
    domains: string[];
    includeChallenges: boolean;
    screenPrivacy: boolean;
    weeklyBudget: number;
  };
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function requireThat(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}
export function emptyState(): State {
  return {
    schemaVersion: SCHEMA,
    revision: 0,
    spaceId: uid(),
    deviceId: uid(),
    persons: [],
    goals: [],
    actions: [],
    instances: [],
    observations: [],
    attachments: [],
    reviews: [],
    operations: [],
    conflicts: [],
    settings: {
      domains: [...DEFAULT_DOMAINS],
      includeChallenges: false,
      screenPrivacy: false,
      weeklyBudget: 600,
    },
  };
}
export function localDate(zone = "Asia/Shanghai", date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !isNaN(Date.parse(date)) &&
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date
  );
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}
export function periodRange(
  period: Review["period"],
  date: string,
): [string, string] {
  if (period === "week") return [weekStart(date), addDays(weekStart(date), 6)];
  const y = Number(date.slice(0, 4)),
    m = Number(date.slice(5, 7));
  if (period === "year") return [`${y}-01-01`, `${y}-12-31`];
  const startMonth = period === "quarter" ? Math.floor((m - 1) / 3) * 3 + 1 : m;
  const endMonth = startMonth + (period === "quarter" ? 2 : 0);
  return [
    `${y}-${String(startMonth).padStart(2, "0")}-01`,
    new Date(Date.UTC(y, endMonth, 0)).toISOString().slice(0, 10),
  ];
}
export function personOf(s: State, id: string, allowArchived = false): Person {
  const p = s.persons.find((p) => p.id === id);
  requireThat(
    p && !p.deletedAt && (allowArchived || !p.archivedAt),
    "人物已归档或删除，请先恢复",
  );
  return p;
}
export function goalOf(s: State, id: string, personId: string): Goal {
  const g = s.goals.find((g) => g.id === id);
  requireThat(g && g.personId === personId, "目标不属于当前人物");
  return g;
}
function event(
  s: State,
  kind: string,
  entityId: string,
  payload: unknown,
  personId?: string,
) {
  const person = personId
    ? s.persons.find((p) => p.id === personId)
    : undefined;
  if (person) person.updatedAt = now();
  s.revision++;
  s.operations.push({
    id: uid(),
    deviceId: s.deviceId,
    seq: s.revision,
    kind,
    entityId,
    personId,
    at: now(),
    payload: structuredClone(payload),
  });
}
export function createPerson(
  s: State,
  input: Pick<Person, "name" | "relation" | "note" | "timezone" | "consent">,
): string {
  requireThat(
    input.name.trim().length >= 1 && [...input.name.trim()].length <= 30,
    "昵称需为 1 至 30 个字",
  );
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: input.timezone });
  } catch {
    throw new Error("请输入有效的 IANA 时区");
  }
  requireThat(
    input.relation === "自己" || input.consent,
    "请确认已获得记录和管理该人物信息的授权",
  );
  const p: Person = {
    ...input,
    name: input.name.trim(),
    id: uid(),
    direction: "",
    pinned: false,
    order: s.persons.length,
    createdAt: now(),
    updatedAt: now(),
  };
  s.persons.push(p);
  event(s, "person.create", p.id, p, p.id);
  return p.id;
}
export function updatePerson(
  s: State,
  id: string,
  input: Partial<
    Pick<
      Person,
      | "name"
      | "relation"
      | "note"
      | "direction"
      | "timezone"
      | "pinned"
      | "order"
    >
  >,
) {
  const p = personOf(s, id, true);
  const merged = { ...p, ...input };
  requireThat(
    merged.name.trim().length > 0 && [...merged.name.trim()].length <= 30,
    "昵称需为 1 至 30 个字",
  );
  requireThat(
    merged.relation === "自己" || p.consent,
    "更改为他人档案前请重新取得授权并创建档案",
  );
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: merged.timezone });
  } catch {
    throw new Error("时区无效");
  }
  Object.assign(p, merged, { name: merged.name.trim(), updatedAt: now() });
  event(s, "person.update", id, p, id);
}
export function setPersonState(
  s: State,
  id: string,
  kind: "archive" | "unarchive" | "delete" | "restore",
) {
  const p = s.persons.find((p) => p.id === id);
  requireThat(p, "人物不存在");
  if (kind === "archive") p.archivedAt = now();
  if (kind === "unarchive") delete p.archivedAt;
  if (kind === "delete") p.deletedAt = now();
  if (kind === "restore") {
    requireThat(p.deletedAt, "人物未删除");
    delete p.deletedAt;
  }
  p.updatedAt = now();
  event(s, `person.${kind}`, id, { ...p }, id);
}
export function purgePerson(s: State, id: string) {
  const p = s.persons.find((p) => p.id === id);
  requireThat(p?.deletedAt, "请先将档案移入回收站");
  const goalIds = new Set(
    s.goals.filter((g) => g.personId === id).map((g) => g.id),
  );
  for (const key of [
    "persons",
    "goals",
    "actions",
    "instances",
    "observations",
    "attachments",
    "reviews",
  ] as const) {
    (s[key] as { id: string; personId?: string }[]) = s[key].filter((v) =>
      key === "persons"
        ? v.id !== id
        : (v as { personId: string }).personId !== id,
    ) as never;
  }
  s.conflicts = s.conflicts.filter((c) => !goalIds.has(c.goalId));
  s.operations = s.operations.filter((o) => o.personId !== id);
  event(s, "person.purge", id, { deleted: true }, id);
}
export function defaultGoal(personId: string, date: string): Goal {
  return {
    id: uid(),
    personId,
    title: "",
    horizon: "year",
    domain: DEFAULT_DOMAINS[1],
    start: date,
    end: `${date.slice(0, 4)}-12-31`,
    metric: "increase",
    baseline: 0,
    target: 10,
    unit: "次",
    weight: 1,
    challenge: false,
    includedInAnnual: true,
    measurement: "latest",
    aggregation: "self",
    weeklyMinutes: 60,
    cadence: "none",
    freshnessDays: 7,
    scaleLabels: [
      "尚未开始",
      "能够理解",
      "在协助下完成",
      "能够独立完成",
      "能够指导他人",
    ],
    status: "draft",
    milestones: [],
    versions: [],
    createdAt: now(),
    updatedAt: now(),
  };
}
function config(g: Goal): GoalConfig {
  const {
    id,
    personId,
    status,
    milestones,
    versions,
    createdAt,
    updatedAt,
    ...c
  } = g;
  return structuredClone(c);
}
export function validateGoal(s: State, g: Goal) {
  personOf(s, g.personId);
  requireThat(
    g.title.trim().length >= 1 && [...g.title.trim()].length <= 80,
    "目标名称需为 1 至 80 个字",
  );
  requireThat(
    validDate(g.start) && validDate(g.end) && g.start <= g.end,
    "开始日期不能晚于截止日期",
  );
  requireThat(
    ["increase", "decrease", "frequency", "milestone", "scale"].includes(
      g.metric,
    ),
    "请选择有效验收方式",
  );
  requireThat(Number.isFinite(g.weight) && g.weight > 0, "目标权重必须大于 0");
  requireThat(
    Number.isFinite(g.baseline) && Number.isFinite(g.target),
    "指标必须是有效数字",
  );
  if (g.metric === "increase")
    requireThat(g.target > g.baseline, "增长型目标值必须大于基线");
  if (g.metric === "decrease")
    requireThat(g.target < g.baseline, "降低型目标值必须小于基线");
  if (g.metric === "frequency")
    requireThat(
      Number.isInteger(g.target) && g.target > 0,
      "频次目标必须为正整数",
    );
  if (g.metric === "scale")
    requireThat(
      g.scaleLabels.length === 5 && g.scaleLabels.every((l) => l.trim()),
      "请填写 5 级量表的含义",
    );
  if (g.metric === "milestone")
    requireThat(
      g.milestones.length > 0 &&
        g.milestones.every(
          (m) =>
            m.title.trim() &&
            Number.isFinite(m.weight) &&
            m.weight > 0 &&
            validDate(m.date) &&
            m.date >= g.start &&
            m.date <= g.end,
        ),
      "里程碑需有标题、正权重和目标周期内的日期",
    );
  requireThat(
    Number.isFinite(g.weeklyMinutes) &&
      g.weeklyMinutes >= 0 &&
      g.freshnessDays > 0,
    "时间预算或更新周期无效",
  );
  if (g.parentId) {
    const seen = new Set([g.id]);
    let parentId: string | undefined = g.parentId;
    while (parentId) {
      requireThat(!seen.has(parentId), "目标不能循环关联");
      seen.add(parentId);
      const p = goalOf(s, parentId, g.personId);
      requireThat(
        g.start >= p.start && g.end <= p.end,
        "子目标日期需在父目标周期内",
      );
      parentId = p.parentId;
    }
  }
  requireThat(
    s.goals
      .filter((c) => c.parentId === g.id)
      .every((c) => c.start >= g.start && c.end <= g.end),
    "调整后的周期不能排除已有子目标",
  );
}
export function saveGoal(s: State, input: Goal, reason?: string) {
  const g = structuredClone(input);
  g.title = g.title.trim();
  validateGoal(s, g);
  const index = s.goals.findIndex((old) => old.id === g.id);
  if (index >= 0) {
    const old = s.goals[index];
    requireThat(old.personId === g.personId, "已有目标不可转移给其他人物");
    requireThat(!!reason?.trim(), "调整目标需说明原因");
    g.versions = [
      ...old.versions,
      {
        version: old.versions.length + 1,
        at: now(),
        reason: reason!.trim(),
        config: config(g),
        milestones: structuredClone(g.milestones),
      },
    ];
    s.goals[index] = g;
  } else {
    g.versions = [
      {
        version: 1,
        at: now(),
        reason: "建立目标",
        config: config(g),
        milestones: structuredClone(g.milestones),
      },
    ];
    s.goals.push(g);
  }
  g.updatedAt = now();
  event(s, "goal.save", g.id, g, g.personId);
}
export function transitionGoal(
  s: State,
  id: string,
  status: GoalStatus,
  reason = "",
) {
  const g = s.goals.find((g) => g.id === id);
  requireThat(g, "目标不存在");
  personOf(s, g.personId);
  if (status === "completed")
    requireThat(
      (goalProgress(s, g) ?? 0) >= 1,
      "成果尚未达到验收条件，请先记录成果",
    );
  if (status === "terminated") requireThat(reason.trim(), "终止目标需填写原因");
  g.status = status;
  g.updatedAt = now();
  event(s, "goal.status", id, { status, reason }, g.personId);
}
export function acceptMilestone(s: State, goalId: string, milestoneId: string) {
  const g = s.goals.find((g) => g.id === goalId);
  requireThat(g, "目标不存在");
  personOf(s, g.personId);
  const m = g.milestones.find((m) => m.id === milestoneId);
  requireThat(m, "里程碑不存在");
  if (m.acceptedAt) delete m.acceptedAt;
  else m.acceptedAt = now();
  g.updatedAt = now();
  event(s, "milestone.accept", m.id, m, g.personId);
}
export function addObservation(
  s: State,
  input: Omit<Observation, "id" | "recordedAt">,
): string {
  personOf(s, input.personId);
  requireThat(
    input.text.trim() || input.value !== undefined,
    "请填写进展或指标数值",
  );
  requireThat(
    !isNaN(Date.parse(input.eventTime)) &&
      Date.parse(input.eventTime) <= Date.now() + 60000,
    "记录发生时间无效或在未来",
  );
  requireThat(input.text.length <= 10000, "单条记录请控制在 10000 字以内");
  if (input.goalId) {
    const g = goalOf(s, input.goalId, input.personId);
    requireThat(
      g.status !== "draft" && g.status !== "archived",
      "请先激活目标",
    );
    if (input.value !== undefined) {
      requireThat(Number.isFinite(input.value), "指标数值无效");
      if (g.metric === "frequency")
        requireThat(
          Number.isInteger(input.value) && input.value > 0,
          "有效次数需为正整数",
        );
      if (g.metric === "scale")
        requireThat(
          [0, 25, 50, 75, 100].includes(input.value),
          "请选择预设量表等级",
        );
    }
  } else requireThat(input.value === undefined, "指标数值必须关联目标");
  const o: Observation = { ...input, id: uid(), recordedAt: now() };
  if (input.supersedesId) {
    const old = s.observations.find((o) => o.id === input.supersedesId);
    requireThat(
      old && old.personId === input.personId && old.goalId === input.goalId,
      "被修正记录归属不符",
    );
  }
  const g = s.goals.find((g) => g.id === input.goalId);
  if (g) {
    o.goalVersion = g.versions.length;
    o.unit = g.unit;
  }
  const same = s.observations.filter(
    (old) =>
      old.goalId === input.goalId &&
      old.eventTime === input.eventTime &&
      old.value !== undefined &&
      old.value !== input.value &&
      old.id !== input.supersedesId &&
      (!g || compatibleObservation(g, old)) &&
      !old.conflicted,
  );
  if (
    g &&
    g.measurement !== "delta" &&
    ["increase", "decrease", "scale"].includes(g.metric) &&
    input.value !== undefined &&
    same.length
  ) {
    o.conflicted = true;
    same.forEach((old) => (old.conflicted = true));
    s.conflicts.push({
      id: uid(),
      goalId: g.id,
      observationIds: [...same.map((o) => o.id), o.id],
      resolved: false,
    });
  }
  s.observations.push(o);
  event(s, "observation.add", o.id, o, o.personId);
  return o.id;
}
export function resolveObservation(
  s: State,
  conflictId: string,
  chosenId: string,
) {
  const c = s.conflicts.find((c) => c.id === conflictId);
  requireThat(
    c && !c.resolved && c.observationIds.includes(chosenId),
    "冲突或选项无效",
  );
  c.resolved = true;
  c.observationIds.forEach((id) => {
    const o = s.observations.find((o) => o.id === id)!;
    o.conflicted = id !== chosenId;
  });
  event(
    s,
    "conflict.resolve",
    c.id,
    { ...c, chosenId },
    s.goals.find((g) => g.id === c.goalId)?.personId,
  );
}
export function addAttachment(s: State, input: Attachment) {
  personOf(s, input.personId);
  requireThat(
    s.observations.some(
      (o) => o.id === input.observationId && o.personId === input.personId,
    ),
    "附件记录归属无效",
  );
  requireThat(
    input.size > 0 &&
      input.size <= 5 * 1024 * 1024 &&
      ["image/png", "image/jpeg", "application/pdf"].includes(input.mime),
    "仅支持不超过 5MB 的 PNG、JPEG、PDF",
  );
  requireThat(
    s.attachments.reduce((n, a) => n + a.size, 0) + input.size <=
      10 * 1024 * 1024,
    "本地版附件总量上限为 10MB，请先导出或删除不再需要的附件",
  );
  requireThat(!s.attachments.some((a) => a.id === input.id), "附件已存在");
  s.attachments.push(input);
  const { data, ...metadata } = input;
  event(s, "attachment.add", input.id, metadata, input.personId);
}
export function removeAttachment(s: State, id: string) {
  const a = s.attachments.find((a) => a.id === id);
  requireThat(a, "附件不存在");
  personOf(s, a.personId);
  s.attachments = s.attachments.filter((v) => v.id !== id);
  event(s, "attachment.remove", id, { deleted: true }, a.personId);
}
function compatibleObservation(g: Goal, o: Observation) {
  const c = o.goalVersion
    ? g.versions.find((v) => v.version === o.goalVersion)?.config
    : undefined;
  return (
    !c ||
    (c.metric === g.metric &&
      c.unit === g.unit &&
      c.measurement === g.measurement &&
      (g.metric !== "scale" ||
        JSON.stringify(c.scaleLabels) === JSON.stringify(g.scaleLabels)))
  );
}
export function currentValue(s: State, g: Goal): number | null {
  const replaced = new Set(
    s.observations.map((o) => o.supersedesId).filter(Boolean),
  );
  const observations = s.observations.filter(
    (o) =>
      o.goalId === g.id &&
      o.value !== undefined &&
      compatibleObservation(g, o) &&
      !o.conflicted &&
      !replaced.has(o.id),
  );
  if (!observations.length) return null;
  if (g.metric === "frequency")
    return observations
      .filter((o) => {
        const d = localDate(
          personOf(s, g.personId, true).timezone,
          new Date(o.eventTime),
        );
        return d >= g.start && d <= g.end;
      })
      .reduce((sum, o) => sum + o.value!, 0);
  if (g.measurement === "delta" && ["increase", "decrease"].includes(g.metric))
    return g.baseline + observations.reduce((sum, o) => sum + o.value!, 0);
  return observations.sort((a, b) => b.eventTime.localeCompare(a.eventTime))[0]
    .value!;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function goalProgress(
  s: State,
  g: Goal,
  seen = new Set<string>(),
): number | null {
  if (seen.has(g.id)) return null;
  seen.add(g.id);
  if (g.aggregation === "children") {
    const children = s.goals.filter((c) => c.parentId === g.id);
    const result = weighted(
      children.map((c) => ({
        weight: c.weight,
        value: goalProgress(s, c, new Set(seen)),
      })),
    );
    return result.coverage === 1 ? result.progress : null;
  }
  if (g.metric === "milestone") {
    const total = g.milestones.reduce((n, m) => n + m.weight, 0);
    return total
      ? clamp(
          g.milestones
            .filter((m) => m.acceptedAt)
            .reduce((n, m) => n + m.weight, 0) / total,
        )
      : null;
  }
  const v = currentValue(s, g);
  if (v === null) return null;
  if (g.metric === "increase")
    return clamp((v - g.baseline) / (g.target - g.baseline));
  if (g.metric === "decrease")
    return clamp((g.baseline - v) / (g.baseline - g.target));
  if (g.metric === "frequency") return clamp(v / g.target);
  return clamp(v / 100);
}
export function weighted(values: { weight: number; value: number | null }[]) {
  const total = values.reduce((n, v) => n + v.weight, 0),
    known = values.filter((v) => v.value !== null),
    knownWeight = known.reduce((n, v) => n + v.weight, 0);
  return {
    progress: knownWeight
      ? known.reduce((n, v) => n + v.weight * v.value!, 0) / knownWeight
      : null,
    coverage: total ? knownWeight / total : 0,
    total: values.length,
  };
}
export function annualProgress(s: State, personId: string, year: string) {
  const candidates = s.goals.filter(
    (g) =>
      g.personId === personId &&
      g.horizon === "year" &&
      g.start.slice(0, 4) <= year &&
      g.end.slice(0, 4) >= year &&
      g.status !== "draft" &&
      g.includedInAnnual !== false &&
      (!g.challenge || s.settings.includeChallenges),
  );
  const ids = new Set(candidates.map((g) => g.id));
  return weighted(
    candidates
      .filter((g) => {
        let parent = g.parentId;
        while (parent) {
          if (ids.has(parent)) return false;
          parent = s.goals.find((p) => p.id === parent)?.parentId;
        }
        return true;
      })
      .map((g) => ({ weight: g.weight, value: goalProgress(s, g) })),
  );
}
export function goalAttention(s: State, g: Goal, date: string): string | null {
  if (g.status === "completed") return "已完成";
  if (g.status !== "active") return null;
  if (s.conflicts.some((c) => c.goalId === g.id && !c.resolved))
    return "进度待确认";
  const progress = goalProgress(s, g);
  if (progress === null) return "待补充进度";
  if (g.milestones.some((m) => !m.acceptedAt && m.date < date))
    return "里程碑已逾期";
  if (date > g.end && progress < 1) return "已超过截止日期";
  const last = s.observations
    .filter((o) => o.goalId === g.id)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  if (
    last &&
    addDays(
      localDate("Asia/Shanghai", new Date(last.recordedAt)),
      g.freshnessDays,
    ) < date
  )
    return "待更新";
  if (g.cadence === "linear" && g.start < date && g.start !== g.end) {
    const expected = clamp(
      (Date.parse(date) - Date.parse(g.start)) /
        (Date.parse(g.end) - Date.parse(g.start)),
    );
    if (expected - progress > 0.15) return "需关注";
  }
  return progress >= 1 ? "可验收" : "按计划";
}
export function saveAction(s: State, input: Action) {
  personOf(s, input.personId);
  if (input.goalId) goalOf(s, input.goalId, input.personId);
  requireThat(
    input.title.trim().length >= 1 && input.title.trim().length <= 80,
    "行动名称需为 1 至 80 个字",
  );
  requireThat(
    validDate(input.date) &&
      (!input.end || (validDate(input.end) && input.end >= input.date)),
    "行动日期无效",
  );
  requireThat(
    Number.isFinite(input.minutes) &&
      input.minutes >= 0 &&
      input.minutes <= 1440,
    "预计耗时需在 0 至 1440 分钟之间",
  );
  const r = input.repeat;
  requireThat(
    ["once", "daily", "weekdays", "weekly", "monthly", "interval"].includes(
      r.kind,
    ),
    "重复规则无效",
  );
  if (r.kind === "weekdays")
    requireThat(
      r.weekdays.length > 0 &&
        r.weekdays.every((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      "请选择每周的有效星期",
    );
  if (r.kind === "weekly")
    requireThat(
      Number.isInteger(r.count) && r.count >= 1 && r.count <= 7,
      "每周次数需为 1 至 7 次",
    );
  if (r.kind === "monthly")
    requireThat(
      Number.isInteger(r.monthDay) && r.monthDay >= 1 && r.monthDay <= 31,
      "每月日期需为 1 至 31 日，短月跳过",
    );
  if (r.kind === "interval")
    requireThat(
      Number.isInteger(r.interval) && r.interval >= 1 && r.interval <= 365,
      "间隔需为 1 至 365 天",
    );
  const old = s.actions.find((a) => a.id === input.id);
  if (old) {
    requireThat(old.personId === input.personId, "行动不可跨人物移动");
    Object.assign(old, input, {
      repeat: { ...r, version: old.repeat.version + 1 },
      updatedAt: now(),
    });
  } else s.actions.push({ ...input, title: input.title.trim() });
  event(s, "action.save", input.id, input, input.personId);
}
export function scheduled(a: Action, date: string): boolean {
  if (a.paused || date < a.date || (a.end && date > a.end)) return false;
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  switch (a.repeat.kind) {
    case "once":
      return date === a.date;
    case "daily":
      return true;
    case "weekdays":
      return a.repeat.weekdays.includes(day);
    case "weekly":
      return true;
    case "monthly":
      return Number(date.slice(8)) === a.repeat.monthDay;
    case "interval":
      return (
        Math.round((Date.parse(date) - Date.parse(a.date)) / 86400000) %
          a.repeat.interval ===
        0
      );
  }
}
export function instancesOn(
  s: State,
  personId: string,
  date: string,
): Instance[] {
  const p = personOf(s, personId, true);
  if (p.archivedAt)
    return s.instances.filter(
      (i) => i.personId === personId && i.date === date,
    );
  const result: Instance[] = [];
  for (const a of s.actions.filter((a) => a.personId === personId)) {
    if (!scheduled(a, date)) continue;
    if (a.repeat.kind === "weekly") {
      const start = weekStart(date),
        period = `week:${start}`;
      for (let i = 0; i < a.repeat.count; i++) {
        const id = `${a.id}:${a.repeat.version}:${period}:${i}`;
        const saved = s.instances.find((v) => v.id === id);
        result.push(
          saved ?? {
            id,
            actionId: a.id,
            personId,
            ruleVersion: a.repeat.version,
            date: addDays(start, 6),
            originalDate: addDays(start, 6),
            period,
            done: false,
            cancelled: false,
            reschedules: 0,
          },
        );
      }
    } else {
      const id = `${a.id}:${a.repeat.version}:${date}`;
      const saved = s.instances.find((v) => v.id === id);
      if (!saved || saved.date === date)
        result.push(
          saved ?? {
            id,
            actionId: a.id,
            personId,
            ruleVersion: a.repeat.version,
            date,
            originalDate: date,
            period: date,
            done: false,
            cancelled: false,
            reschedules: 0,
          },
        );
    }
  }
  for (const saved of s.instances.filter(
    (i) => i.personId === personId && i.date === date,
  ))
    if (!result.some((i) => i.id === saved.id)) result.push(saved);
  return result.filter((i) => !i.cancelled);
}
export function completeInstance(s: State, input: Instance, done: boolean) {
  personOf(s, input.personId);
  const a = s.actions.find((a) => a.id === input.actionId);
  requireThat(a && a.personId === input.personId, "行动归属无效");
  requireThat(!a.paused, "行动已暂停");
  if (a.goalId) {
    const g = goalOf(s, a.goalId, a.personId);
    requireThat(
      g.status !== "paused" &&
        g.status !== "terminated" &&
        g.status !== "archived",
      "关联目标已暂停或结束",
    );
  }
  const today = localDate(personOf(s, input.personId).timezone);
  requireThat(
    input.period.startsWith("week:")
      ? input.period.slice(5) <= today
      : input.date <= today,
    "未来行动不能提前计为已完成",
  );
  if (done && input.period.startsWith("week:"))
    requireThat(
      !s.instances.some(
        (i) =>
          i.actionId === input.actionId &&
          i.id !== input.id &&
          i.done &&
          i.completedAt &&
          localDate(
            personOf(s, input.personId).timezone,
            new Date(i.completedAt),
          ) === today,
      ),
      "这个习惯今天已经完成一次，明天再继续吧",
    );
  let i = s.instances.find((i) => i.id === input.id);
  if (i?.done === done) return;
  if (!i) {
    i = structuredClone(input);
    s.instances.push(i);
  }
  i.done = done;
  i.completedAt = done ? now() : undefined;
  event(s, done ? "action.complete" : "action.undo", i.id, i, i.personId);
}
export function rescheduleInstance(
  s: State,
  input: Instance,
  date: string,
  reason: string,
) {
  personOf(s, input.personId);
  requireThat(validDate(date) && reason.trim(), "改期需有效日期与原因");
  requireThat(!input.done, "已完成行动不可改期");
  requireThat(!input.period.startsWith("week:"), "每周次数习惯请调整未来规则");
  let i = s.instances.find((i) => i.id === input.id);
  if (!i) {
    i = structuredClone(input);
    s.instances.push(i);
  }
  i.date = date;
  i.reschedules++;
  event(s, "action.reschedule", i.id, { ...i, reason }, i.personId);
}
export function toggleActionPaused(s: State, id: string) {
  const a = s.actions.find((a) => a.id === id);
  requireThat(a, "行动不存在");
  personOf(s, a.personId);
  a.paused = !a.paused;
  event(s, "action.pause", id, a, a.personId);
}
export function actionsSummary(s: State, personId: string, date: string) {
  const today = instancesOn(s, personId, date).filter(
    (i) => !i.period.startsWith("week:"),
  );
  return { done: today.filter((i) => i.done).length, total: today.length };
}
export function reviewSnapshot(
  s: State,
  personId: string,
  start: string,
  end: string,
): ReviewSnapshot {
  const person = personOf(s, personId);
  const today = localDate(person.timezone);
  const seen = new Set<string>();
  const due: Instance[] = [];
  for (let date = start; date <= end && date <= today; date = addDays(date, 1))
    for (const i of instancesOn(s, personId, date)) {
      if (
        i.originalDate >= start &&
        i.originalDate <= end &&
        i.originalDate <= today &&
        !seen.has(i.id)
      ) {
        seen.add(i.id);
        due.push(i);
      }
    }
  for (const i of s.instances.filter(
    (i) =>
      i.personId === personId &&
      !i.cancelled &&
      i.originalDate >= start &&
      i.originalDate <= end &&
      i.originalDate <= today,
  )) {
    if (!seen.has(i.id)) {
      seen.add(i.id);
      due.push(i);
    }
  }
  return {
    calcVersion: CALC_VERSION,
    timezone: person.timezone,
    capturedAt: now(),
    start,
    end,
    completed: due.filter((i) => i.done).length,
    due: due.length,
    goalProgress: s.goals
      .filter((g) => g.personId === personId && g.status !== "draft")
      .map((g) => ({
        id: g.id,
        title: g.title,
        version: g.versions.length,
        progress: goalProgress(s, g),
      })),
    observationIds: s.observations
      .filter(
        (o) =>
          o.personId === personId &&
          localDate(person.timezone, new Date(o.eventTime)) >= start &&
          localDate(person.timezone, new Date(o.eventTime)) <= end,
      )
      .map((o) => o.id),
  };
}
export function saveReview(s: State, input: Review) {
  personOf(s, input.personId);
  requireThat(
    validDate(input.start) && validDate(input.end) && input.start <= input.end,
    "复盘周期无效",
  );
  requireThat(input.next.length <= 3, "下周期最多三个重点");
  const old = s.reviews.find((r) => r.id === input.id);
  requireThat(
    !old || old.status === "draft",
    "已发布复盘不可修改，请创建修订版",
  );
  if (input.status === "published")
    requireThat(
      input.wins.trim() ||
        input.obstacles.trim() ||
        input.methods.trim() ||
        input.next.length,
      "请至少填写一项复盘内容",
    );
  if (input.previousId) {
    const previous = s.reviews.find((r) => r.id === input.previousId);
    requireThat(
      previous &&
        previous.personId === input.personId &&
        previous.status === "published",
      "复盘修订来源无效",
    );
  }
  const value = structuredClone(input);
  value.snapshot = reviewSnapshot(s, input.personId, input.start, input.end);
  if (old) Object.assign(old, value);
  else s.reviews.push(value);
  event(s, "review.save", value.id, value, value.personId);
}
export function updateSettings(s: State, input: Partial<State["settings"]>) {
  const settings = { ...s.settings, ...input };
  requireThat(
    settings.domains.length > 0 &&
      settings.domains.length <= 30 &&
      settings.domains.every((d) => d.trim() && d.length <= 30),
    "领域需为 1 至 30 项，每项不超过 30 字",
  );
  requireThat(
    Number.isFinite(settings.weeklyBudget) && settings.weeklyBudget >= 0,
    "时间预算无效",
  );
  s.settings = settings;
  event(s, "settings.update", s.spaceId, settings);
}
export function validateState(value: unknown): State {
  const s = value as State;
  requireThat(s && typeof s === "object", "备份格式无效");
  requireThat(
    s.schemaVersion === SCHEMA,
    "备份版本不兼容，请更新应用，当前数据未变",
  );
  requireThat(
    typeof s.spaceId === "string" &&
      typeof s.deviceId === "string" &&
      Number.isInteger(s.revision) &&
      s.revision >= 0,
    "备份标识无效",
  );
  for (const k of [
    "persons",
    "goals",
    "actions",
    "instances",
    "observations",
    "attachments",
    "reviews",
    "operations",
    "conflicts",
  ] as const)
    requireThat(
      Array.isArray(s[k]) && s[k].length <= 200000,
      "备份数据超出范围",
    );
  const personIds = new Set<string>();
  for (const p of s.persons) {
    requireThat(
      typeof p.id === "string" &&
        !personIds.has(p.id) &&
        typeof p.name === "string" &&
        p.name.length >= 1 &&
        p.name.length <= 60 &&
        typeof p.note === "string" &&
        typeof p.relation === "string" &&
        typeof p.direction === "string" &&
        Number.isFinite(p.order) &&
        typeof p.updatedAt === "string",
      "人物数据无效",
    );
    personIds.add(p.id);
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: p.timezone });
    } catch {
      throw new Error("备份人物时区无效");
    }
  }
  for (const key of [
    "goals",
    "actions",
    "instances",
    "observations",
    "reviews",
  ] as const) {
    const ids = new Set<string>();
    for (const v of s[key]) {
      requireThat(
        typeof v.id === "string" && !ids.has(v.id) && personIds.has(v.personId),
        "备份实体重复或人物归属无效",
      );
      ids.add(v.id);
    }
  }
  const goals = new Map(s.goals.map((g) => [g.id, g]));
  const actions = new Map(s.actions.map((a) => [a.id, a]));
  for (const g of s.goals) {
    requireThat(
      typeof g.title === "string" &&
        g.title.length <= 80 &&
        validDate(g.start) &&
        validDate(g.end) &&
        g.start <= g.end &&
        Number.isFinite(g.weight) &&
        g.weight > 0 &&
        Array.isArray(g.versions) &&
        Array.isArray(g.milestones) &&
        ["long", "year", "quarter", "custom"].includes(g.horizon) &&
        ["increase", "decrease", "milestone", "frequency", "scale"].includes(
          g.metric,
        ) &&
        [
          "draft",
          "active",
          "paused",
          "completed",
          "terminated",
          "archived",
        ].includes(g.status) &&
        Number.isFinite(g.baseline) &&
        Number.isFinite(g.target) &&
        Array.isArray(g.scaleLabels) &&
        g.scaleLabels.every((v) => typeof v === "string"),
      "目标数据无效",
    );
    if (g.metric === "increase")
      requireThat(g.target > g.baseline, "增长指标边界无效");
    if (g.metric === "decrease")
      requireThat(g.target < g.baseline, "降低指标边界无效");
    if (g.metric === "frequency")
      requireThat(Number.isInteger(g.target) && g.target > 0, "频次指标无效");
    for (const m of g.milestones)
      requireThat(
        typeof m.id === "string" &&
          typeof m.title === "string" &&
          Number.isFinite(m.weight) &&
          m.weight > 0 &&
          validDate(m.date),
        "里程碑数据无效",
      );
    for (const v of g.versions)
      requireThat(
        v.config && Number.isInteger(v.version) && typeof v.reason === "string",
        "目标版本无效",
      );
    let parent = g.parentId;
    const seen = new Set([g.id]);
    while (parent) {
      const p = goals.get(parent);
      requireThat(
        p && p.personId === g.personId && !seen.has(parent),
        "目标关联无效或存在循环",
      );
      seen.add(parent);
      parent = p.parentId;
    }
  }
  for (const a of s.actions) {
    requireThat(
      typeof a.title === "string" &&
        validDate(a.date) &&
        a.repeat &&
        Number.isInteger(a.repeat.version) &&
        Number.isFinite(a.minutes) &&
        ["once", "daily", "weekdays", "weekly", "monthly", "interval"].includes(
          a.repeat.kind,
        ) &&
        Array.isArray(a.repeat.weekdays) &&
        a.repeat.weekdays.every(
          (v) => Number.isInteger(v) && v >= 0 && v <= 6,
        ) &&
        Number.isInteger(a.repeat.count) &&
        a.repeat.count >= 1 &&
        a.repeat.count <= 7 &&
        Number.isInteger(a.repeat.interval) &&
        a.repeat.interval >= 1 &&
        a.repeat.interval <= 365 &&
        Number.isInteger(a.repeat.monthDay) &&
        a.repeat.monthDay >= 1 &&
        a.repeat.monthDay <= 31,
      "行动数据无效",
    );
    if (a.goalId)
      requireThat(
        goals.get(a.goalId)?.personId === a.personId,
        "行动关联目标归属无效",
      );
  }
  for (const i of s.instances)
    requireThat(
      actions.get(i.actionId)?.personId === i.personId && validDate(i.date),
      "行动实例归属无效",
    );
  for (const o of s.observations) {
    requireThat(
      typeof o.text === "string" &&
        !isNaN(Date.parse(o.eventTime)) &&
        (o.value === undefined || Number.isFinite(o.value)),
      "观察记录无效",
    );
    if (o.goalId)
      requireThat(
        goals.get(o.goalId)?.personId === o.personId,
        "指标关联目标归属无效",
      );
  }
  for (const r of s.reviews)
    requireThat(
      r.snapshot &&
        Array.isArray(r.snapshot.goalProgress) &&
        Array.isArray(r.snapshot.observationIds) &&
        Array.isArray(r.next) &&
        r.next.length <= 3 &&
        r.next.every((v) => typeof v === "string") &&
        typeof r.wins === "string" &&
        typeof r.obstacles === "string" &&
        typeof r.methods === "string" &&
        ["week", "month", "quarter", "year"].includes(r.period) &&
        ["draft", "published"].includes(r.status) &&
        validDate(r.start) &&
        validDate(r.end),
      "复盘数据无效",
    );
  const opIds = new Set<string>();
  for (const o of s.operations) {
    requireThat(
      typeof o.id === "string" &&
        !opIds.has(o.id) &&
        Number.isInteger(o.seq) &&
        o.seq >= 0 &&
        typeof o.kind === "string",
      "操作日志无效",
    );
    opIds.add(o.id);
  }
  for (const c of s.conflicts)
    requireThat(
      goals.has(c.goalId) &&
        Array.isArray(c.observationIds) &&
        c.observationIds.every((id) => s.observations.some((o) => o.id === id)),
      "冲突引用无效",
    );
  let attachmentBytes = 0;
  const attachmentIds = new Set<string>();
  for (const a of s.attachments) {
    requireThat(
      typeof a.id === "string" &&
        !attachmentIds.has(a.id) &&
        typeof a.name === "string" &&
        a.name.length <= 200 &&
        ["image/png", "image/jpeg", "application/pdf"].includes(a.mime) &&
        Number.isInteger(a.size) &&
        a.size > 0 &&
        a.size <= 5 * 1024 * 1024 &&
        typeof a.data === "string" &&
        a.data.length <= 7 * 1024 * 1024 &&
        /^[a-f0-9]{64}$/.test(a.sha256) &&
        s.observations.some(
          (o) => o.id === a.observationId && o.personId === a.personId,
        ),
      "附件数据无效",
    );
    attachmentBytes += a.size;
    attachmentIds.add(a.id);
  }
  requireThat(attachmentBytes <= 10 * 1024 * 1024, "附件总量超出本地版上限");
  requireThat(
    s.settings &&
      Array.isArray(s.settings.domains) &&
      s.settings.domains.length >= 1 &&
      s.settings.domains.length <= 30 &&
      s.settings.domains.every(
        (d) => typeof d === "string" && d.length <= 30,
      ) &&
      Number.isFinite(s.settings.weeklyBudget),
    "设置数据无效",
  );
  return s;
}
