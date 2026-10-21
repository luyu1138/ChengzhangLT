import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../src/domain.ts";
import {
  encryptBackup,
  decryptBackup,
  recoveryCode,
  observationsCsv,
} from "../src/backup.ts";

function fixture() {
  const s = D.emptyState();
  const id = D.createPerson(s, {
    name: "我",
    relation: "自己",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  return { s, id, date: D.localDate() };
}
function goal(s: D.State, id: string, extra: Partial<D.Goal> = {}) {
  const g = {
    ...D.defaultGoal(id, D.localDate()),
    title: "完成阅读",
    status: "active" as const,
    ...extra,
  };
  D.saveGoal(s, g);
  return s.goals.at(-1)!;
}
function record(
  s: D.State,
  g: D.Goal,
  value: number,
  eventTime = new Date(Date.now() - 1000).toISOString(),
) {
  D.addObservation(s, {
    personId: g.personId,
    goalId: g.id,
    value,
    text: "成果",
    eventTime,
  });
}
function action(
  s: D.State,
  id: string,
  kind: D.RepeatKind = "once",
  date = D.localDate(),
) {
  const a: D.Action = {
    id: D.uid(),
    personId: id,
    title: "阅读半小时",
    date,
    minutes: 30,
    paused: false,
    repeat: {
      kind,
      weekdays: [1, 3, 5],
      count: 3,
      monthDay: 31,
      interval: 2,
      version: 1,
    },
    createdAt: D.now(),
    updatedAt: D.now(),
  };
  D.saveAction(s, a);
  return a;
}

test("A01: independent IDs for three people, including equal display names", () => {
  const { s, id } = fixture();
  for (let i = 0; i < 2; i++)
    D.createPerson(s, {
      name: "家人",
      relation: "家人",
      note: "",
      timezone: "Asia/Shanghai",
      consent: true,
    });
  assert.equal(s.persons.length, 3);
  assert.equal(new Set(s.persons.map((p) => p.id)).size, 3);
  assert.equal(s.persons[0].id, id);
});
test("other-person profile requires authorization; nickname and timezone validation", () => {
  const { s } = fixture();
  assert.throws(
    () =>
      D.createPerson(s, {
        name: "孩子",
        relation: "孩子",
        note: "",
        timezone: "Asia/Shanghai",
        consent: false,
      }),
    /授权/,
  );
  assert.throws(
    () =>
      D.createPerson(s, {
        name: " ",
        relation: "自己",
        note: "",
        timezone: "Asia/Shanghai",
        consent: true,
      }),
    /昵称/,
  );
  assert.throws(
    () =>
      D.createPerson(s, {
        name: "我",
        relation: "自己",
        note: "",
        timezone: "invalid/zone",
        consent: true,
      }),
    /时区/,
  );
});
test("A02: cross-person goal references fail for observations and actions", () => {
  const { s, id } = fixture();
  const g = goal(s, id);
  const other = D.createPerson(s, {
    name: "家人",
    relation: "家人",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  assert.throws(
    () =>
      D.addObservation(s, {
        personId: other,
        goalId: g.id,
        text: "错误",
        value: 1,
        eventTime: D.now(),
      }),
    /不属于/,
  );
  assert.throws(
    () => D.saveAction(s, { ...action(s, other), goalId: g.id }),
    /不属于/,
  );
});
test("A03: long-term and annual goal relation, date constraints and cycle detection", () => {
  const { s, id, date } = fixture();
  const long = goal(s, id, {
    horizon: "long",
    start: date,
    end: `${Number(date.slice(0, 4)) + 4}-12-31`,
  });
  const annual = goal(s, id, { parentId: long.id });
  assert.equal(annual.parentId, long.id);
  assert.throws(
    () => D.saveGoal(s, { ...long, parentId: annual.id }, "新关系"),
    /循环|周期/,
  );
  assert.throws(
    () => goal(s, id, { parentId: long.id, start: D.addDays(date, -1) }),
    /周期/,
  );
});
test("A04: nonzero baseline and lower-is-better formulas", () => {
  const { s, id } = fixture();
  const up = goal(s, id, { baseline: 10, target: 20 });
  record(s, up, 15);
  assert.equal(D.goalProgress(s, up), 0.5);
  const down = goal(s, id, { metric: "decrease", baseline: 10, target: 2 });
  record(s, down, 6);
  assert.equal(D.goalProgress(s, down), 0.5);
});
test("equal baseline and target are rejected, progress is clamped", () => {
  const { s, id } = fixture();
  assert.throws(() => goal(s, id, { baseline: 10, target: 10 }), /大于/);
  const g = goal(s, id);
  record(s, g, 100);
  assert.equal(D.goalProgress(s, g), 1);
});
test("A05: weighted annual aggregation is 63%", () => {
  const { s, id, date } = fixture();
  for (const [value, weight] of [
    [80, 50],
    [50, 30],
    [40, 20],
  ]) {
    const g = goal(s, id, { target: 100, weight });
    record(s, g, value);
  }
  const r = D.annualProgress(s, id, date.slice(0, 4));
  assert.equal(r.progress, 0.63);
  assert.equal(r.coverage, 1);
});
test("A06: missing data stays null and partial coverage never treats it as zero", () => {
  const { s, id, date } = fixture();
  assert.equal(D.annualProgress(s, id, date.slice(0, 4)).progress, null);
  const a = goal(s, id, { weight: 6 });
  goal(s, id, { weight: 4 });
  record(s, a, 7);
  const r = D.annualProgress(s, id, date.slice(0, 4));
  assert.ok(Math.abs(r.progress! - 0.7) < 1e-12);
  assert.equal(r.coverage, 0.6);
});
test("parent and child are not double-counted in annual set", () => {
  const { s, id, date } = fixture();
  const parent = goal(s, id, { aggregation: "children" });
  const child = goal(s, id, { parentId: parent.id });
  record(s, child, 5);
  const r = D.annualProgress(s, id, date.slice(0, 4));
  assert.equal(r.total, 1);
  assert.equal(r.progress, 0.5);
});
test("challenge goals are excluded by default; paused targets retain annual scope", () => {
  const { s, id, date } = fixture();
  const a = goal(s, id, { status: "paused" });
  record(s, a, 5);
  const b = goal(s, id, { challenge: true });
  record(s, b, 10);
  assert.equal(D.annualProgress(s, id, date.slice(0, 4)).progress, 0.5);
  D.updateSettings(s, { includeChallenges: true });
  assert.equal(D.annualProgress(s, id, date.slice(0, 4)).progress, 0.75);
});
test("milestones only count accepted weights; frequency and custom scale formulas", () => {
  const { s, id, date } = fixture();
  const g = goal(s, id, {
    metric: "milestone",
    milestones: [20, 30, 50].map((weight, i) => ({
      id: String(i),
      title: "阶段" + i,
      date,
      weight,
    })),
  });
  D.acceptMilestone(s, g.id, "0");
  D.acceptMilestone(s, g.id, "1");
  assert.equal(D.goalProgress(s, g), 0.5);
  const f = goal(s, id, { metric: "frequency", target: 3 });
  record(s, f, 1);
  record(s, f, 1);
  assert.equal(D.goalProgress(s, f), 2 / 3);
  const scale = goal(s, id, { metric: "scale" });
  record(s, scale, 75);
  assert.equal(D.goalProgress(s, scale), 0.75);
});
test("state observation uses event time, not entry time", () => {
  const { s, id } = fixture();
  const g = goal(s, id);
  record(s, g, 7, new Date(Date.now() - 1000).toISOString());
  record(s, g, 3, new Date(Date.now() - 86400000).toISOString());
  assert.equal(D.currentValue(s, g), 7);
});
test("equal observation times conflict and require explicit resolution", () => {
  const { s, id } = fixture();
  const g = goal(s, id);
  const time = new Date(Date.now() - 1000).toISOString();
  record(s, g, 5, time);
  record(s, g, 7, time);
  assert.equal(D.currentValue(s, g), null);
  assert.equal(s.conflicts.length, 1);
  D.resolveObservation(s, s.conflicts[0].id, s.observations[0].id);
  assert.equal(D.currentValue(s, g), 5);
});
test("A07: weekly quota does not enter Monday overdue denominator", () => {
  const { s, id } = fixture();
  const monday = D.weekStart(D.localDate());
  action(s, id, "weekly", monday);
  const instances = D.instancesOn(s, id, monday);
  assert.equal(instances.length, 3);
  assert.ok(instances.every((i) => i.date === D.addDays(monday, 6)));
  assert.deepEqual(D.actionsSummary(s, id, monday), { done: 0, total: 0 });
});
test("A08 local: completion is idempotent and undo preserves operation history", () => {
  const { s, id, date } = fixture();
  action(s, id);
  const i = D.instancesOn(s, id, date)[0];
  D.completeInstance(s, i, true);
  const count = s.operations.length;
  D.completeInstance(s, i, true);
  assert.equal(s.operations.length, count);
  assert.equal(s.instances.length, 1);
  D.completeInstance(s, i, false);
  assert.equal(s.instances[0].done, false);
  assert.equal(s.operations.at(-1)?.kind, "action.undo");
});
test("weekly habits disallow counting multiple slots on same day", () => {
  const { s, id, date } = fixture();
  action(s, id, "weekly", D.weekStart(date));
  const list = D.instancesOn(s, id, date);
  D.completeInstance(s, list[0], true);
  assert.throws(() => D.completeInstance(s, list[1], true), /已经完成一次/);
});
test("future instances never count as complete; overdue tasks stay out of today", () => {
  const { s, id, date } = fixture();
  action(s, id, "once", D.addDays(date, 1));
  assert.throws(
    () =>
      D.completeInstance(s, D.instancesOn(s, id, D.addDays(date, 1))[0], true),
    /未来/,
  );
  action(s, id, "once", D.addDays(date, -1));
  assert.deepEqual(D.actionsSummary(s, id, date), { done: 0, total: 0 });
});
test("rescheduling preserves original date and count, removing old date display", () => {
  const { s, id, date } = fixture();
  action(s, id, "once", D.addDays(date, -1));
  const i = D.instancesOn(s, id, D.addDays(date, -1))[0];
  D.rescheduleInstance(s, i, date, "今天继续");
  assert.equal(D.instancesOn(s, id, D.addDays(date, -1)).length, 0);
  const next = D.instancesOn(s, id, date)[0];
  assert.equal(next.originalDate, D.addDays(date, -1));
  assert.equal(next.reschedules, 1);
});
test("repeating rules cover weekdays, monthly short months, custom intervals", () => {
  const { s, id } = fixture();
  const a = action(s, id, "weekdays", "2026-10-01");
  assert.equal(D.scheduled(a, "2026-10-21"), true);
  assert.equal(D.scheduled(a, "2026-10-22"), false);
  a.repeat.kind = "monthly";
  assert.equal(D.scheduled(a, "2026-11-30"), false);
  assert.equal(D.scheduled(a, "2026-10-31"), true);
  a.repeat.kind = "interval";
  assert.equal(D.scheduled(a, "2026-10-03"), true);
  assert.equal(D.scheduled(a, "2026-10-04"), false);
});
test("fixed plans accept valid reminder times and reject malformed times without committing", () => {
  const { s, id } = fixture();
  for (const kind of ["daily", "weekdays", "monthly"] as const) {
    const a = action(s, id, kind);
    D.saveAction(s, { ...a, reminderTime: "09:30" });
    assert.equal(s.actions.find((v) => v.id === a.id)?.reminderTime, "09:30");
    const revision = s.revision;
    for (const invalid of ["24:00", "09:60", "9:30", "garbage"])
      assert.throws(
        () => D.saveAction(s, { ...a, reminderTime: invalid }),
        /提醒时间/,
      );
    assert.equal(s.revision, revision);
  }
});
test("daily, weekly and monthly completion records retain independent instance IDs and timestamps", () => {
  const { s, id } = fixture();
  const date = D.localDate(D.personOf(s, id).timezone);
  for (const kind of ["daily", "weekdays", "monthly"] as const) {
    const a = action(s, id, kind, date);
    a.repeat.weekdays = [new Date(date + "T12:00:00Z").getUTCDay()];
    a.repeat.monthDay = Number(date.slice(8));
  }
  const instances = D.instancesOn(s, id, date);
  assert.equal(instances.length, 3);
  for (const instance of instances) D.completeInstance(s, instance, true);
  assert.equal(s.instances.filter((i) => i.done && i.completedAt).length, 3);
  assert.equal(new Set(s.instances.map((i) => i.id)).size, 3);
  D.completeInstance(s, instances[0], false);
  assert.equal(s.instances.filter((i) => i.done).length, 2);
  assert.ok(s.operations.some((op) => op.kind === "action.undo"));
  assert.equal(
    D.instancesOn(s, id, D.addDays(date, 1)).filter((i) => i.done).length,
    0,
  );
});
test("old backups without reminder fields and new fixed-plan backups both restore", async () => {
  const { s, id } = fixture();
  const a = action(s, id, "daily");
  assert.equal(
    D.validateState(structuredClone(s)).actions[0].reminderTime,
    undefined,
  );
  D.saveAction(s, { ...a, reminderTime: "23:30" });
  const code = recoveryCode();
  const restored = await decryptBackup(await encryptBackup(s, code), code);
  assert.equal(restored.actions[0].reminderTime, "23:30");
  restored.actions[0].reminderTime = "25:00";
  assert.throws(() => D.validateState(restored), /行动数据无效/);
});
test("archive suspends future instances and restoration preserves stable IDs", () => {
  const { s, id, date } = fixture();
  action(s, id, "daily");
  D.setPersonState(s, id, "archive");
  assert.equal(D.instancesOn(s, id, D.addDays(date, 1)).length, 0);
  D.setPersonState(s, id, "unarchive");
  assert.equal(D.instancesOn(s, id, date).length, 1);
  D.setPersonState(s, id, "delete");
  assert.throws(
    () =>
      D.addObservation(s, {
        personId: id,
        text: "不能复活",
        eventTime: D.now(),
      }),
    /删除/,
  );
  D.setPersonState(s, id, "restore");
  assert.equal(s.persons[0].id, id);
});
test("A15/A16: published review snapshot survives goal adjustment and backfill", () => {
  const { s, id, date } = fixture();
  const g = goal(s, id);
  record(s, g, 5);
  const [start, end] = D.periodRange("week", date);
  const r: D.Review = {
    id: D.uid(),
    personId: id,
    period: "week",
    start,
    end,
    wins: "有收获",
    obstacles: "",
    methods: "",
    next: ["继续阅读"],
    status: "published",
    revision: 1,
    snapshot: D.reviewSnapshot(s, id, start, end),
    createdAt: D.now(),
  };
  D.saveReview(s, r);
  const original = JSON.stringify(s.reviews[0]);
  D.saveGoal(s, { ...g, target: 20 }, "根据资源调整");
  record(s, g, 8);
  assert.equal(JSON.stringify(s.reviews[0]), original);
  assert.equal(s.goals[0].versions.length, 2);
  assert.equal(s.goals[0].versions[0].config.target, 10);
  assert.throws(() => D.saveReview(s, { ...r, wins: "直接覆盖" }), /不可修改/);
});
test("goal completion requires result acceptance; dates and weights validate", () => {
  const { s, id } = fixture();
  const g = goal(s, id);
  assert.throws(() => D.transitionGoal(s, g.id, "completed"), /成果/);
  record(s, g, 10);
  D.transitionGoal(s, g.id, "completed");
  assert.equal(g.status, "completed");
  assert.throws(() => goal(s, id, { weight: 0 }), /权重/);
  assert.throws(() => goal(s, id, { start: "2026-02-30" }), /日期/);
});
test("A22: permanent deletion clears related entities and their operation payloads", () => {
  const { s, id, date } = fixture();
  const g = goal(s, id);
  record(s, g, 3);
  action(s, id);
  D.completeInstance(s, D.instancesOn(s, id, date)[0], true);
  D.setPersonState(s, id, "delete");
  D.purgePerson(s, id);
  assert.equal(s.persons.length, 0);
  assert.equal(s.goals.length, 0);
  assert.equal(s.observations.length, 0);
  assert.equal(s.instances.length, 0);
  assert.ok(!JSON.stringify(s.operations).includes("阅读"));
});
test("A18: authenticated encrypted backup roundtrip preserves all state and logs", async () => {
  const { s, id } = fixture();
  const g = goal(s, id);
  record(s, g, 3);
  const code = recoveryCode();
  const bytes = await encryptBackup(s, code);
  assert.ok(!new TextDecoder().decode(bytes).includes("完成阅读"));
  assert.deepEqual(await decryptBackup(bytes, code), s);
});
test("A19: wrong key or tampered ciphertext is rejected without touching source", async () => {
  const { s } = fixture();
  const original = JSON.stringify(s),
    code = recoveryCode(),
    bytes = await encryptBackup(s, code);
  await assert.rejects(decryptBackup(bytes, recoveryCode()), /恢复码错误/);
  const envelope = JSON.parse(new TextDecoder().decode(bytes));
  envelope.data = "AAAA" + envelope.data.slice(4);
  await assert.rejects(
    decryptBackup(new TextEncoder().encode(JSON.stringify(envelope)), code),
    /损坏/,
  );
  assert.equal(JSON.stringify(s), original);
});
test("A21: newer schema and cross-person imported references are rejected", () => {
  const { s, id } = fixture();
  assert.throws(() => D.validateState({ ...s, schemaVersion: 99 }), /不兼容/);
  const g = goal(s, id);
  const other = D.createPerson(s, {
    name: "他人",
    relation: "其他",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  const a = action(s, other);
  a.goalId = g.id;
  s.actions[0] = a;
  assert.throws(() => D.validateState(s), /归属/);
});
test("CSV export is person-scoped, quoted and safe against formula injection", () => {
  const { s, id } = fixture();
  D.addObservation(s, {
    personId: id,
    text: '=HYPERLINK("evil")',
    eventTime: D.now(),
  });
  const csv = observationsCsv(s, id);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('""evil""'));
});
test("local dates respect archive timezone rather than device timezone", () => {
  const date = new Date("2026-10-20T00:30:00Z");
  assert.equal(D.localDate("Asia/Shanghai", date), "2026-10-20");
  assert.equal(D.localDate("America/Los_Angeles", date), "2026-10-19");
  assert.deepEqual(D.periodRange("quarter", "2026-10-20"), [
    "2026-10-01",
    "2026-12-31",
  ]);
});
test("cumulative measurements sum real deltas over the baseline", () => {
  const { s, id } = fixture();
  const g = goal(s, id, { baseline: 10, target: 20, measurement: "delta" });
  record(s, g, 2);
  record(s, g, 3);
  assert.equal(D.currentValue(s, g), 15);
  assert.equal(D.goalProgress(s, g), 0.5);
  assert.equal(s.conflicts.length, 0);
});
test("annual scope changes require goal revision; archive alone does not remove results", () => {
  const { s, id, date } = fixture();
  const g = goal(s, id);
  record(s, g, 5);
  D.transitionGoal(s, g.id, "archived");
  assert.equal(D.annualProgress(s, id, date.slice(0, 4)).progress, 0.5);
  D.saveGoal(s, { ...g, includedInAnnual: false }, "移出年度统计");
  assert.equal(D.annualProgress(s, id, date.slice(0, 4)).total, 0);
  assert.equal(s.goals[0].versions[1].reason, "移出年度统计");
});

test("rescheduling does not erase original period commitments from review denominator", () => {
  const { s, id, date } = fixture();
  action(s, id, "once", D.addDays(date, -1));
  const instance = D.instancesOn(s, id, D.addDays(date, -1))[0];
  D.rescheduleInstance(s, instance, D.addDays(date, 8), "调整排期");
  const snapshot = D.reviewSnapshot(s, id, D.addDays(date, -2), date);
  assert.equal(snapshot.due, 1);
  assert.equal(snapshot.completed, 0);
});
test("a unit or measurement change never implicitly converts old observations", () => {
  const { s, id } = fixture();
  const g = goal(s, id, { unit: "本" });
  record(s, g, 5);
  D.saveGoal(s, { ...g, unit: "页" }, "改用新的独立口径");
  const updated = s.goals[0];
  assert.equal(D.currentValue(s, updated), null);
  assert.equal(s.observations[0].unit, "本");
  record(s, updated, 7);
  assert.equal(D.currentValue(s, updated), 7);
});
test("parent date adjustment must continue containing existing children", () => {
  const { s, id, date } = fixture();
  const parent = goal(s, id, { horizon: "long", start: D.addDays(date, -5) });
  goal(s, id, { parentId: parent.id, start: D.addDays(date, -3) });
  assert.throws(
    () => D.saveGoal(s, { ...parent, start: date }, "缩短周期"),
    /子目标/,
  );
});
