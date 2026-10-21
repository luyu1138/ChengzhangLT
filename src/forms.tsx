import { useState, useEffect } from "react";
import { prepareAttachment } from "./attachments";
import { fromBase64 } from "./storage";
import { Plus, Trash2, Info } from "lucide-react";
import { Field, Form, Badge, text, number } from "./components";
import * as D from "./domain";
export type Save = (
  mutator: (s: D.State) => void,
  message?: string,
) => Promise<void>;
export function PersonForm({
  state,
  person,
  save,
  onDone,
}: {
  state: D.State;
  person?: D.Person;
  save: Save;
  onDone: (id: string) => void;
}) {
  const [relation, setRelation] = useState(
    person?.relation ?? (state.persons.length ? "家人" : "自己"),
  );
  return (
    <Form
      submit={person ? "保存档案" : "建立档案"}
      onSubmit={async (f) => {
        let id = person?.id ?? "";
        await save((s) => {
          if (person)
            D.updatePerson(s, person.id, {
              name: text(f, "name"),
              note: text(f, "note"),
              direction: text(f, "direction"),
              timezone: text(f, "timezone"),
            });
          else
            id = D.createPerson(s, {
              name: text(f, "name"),
              relation,
              note: text(f, "note"),
              timezone: text(f, "timezone"),
              consent: f.get("consent") === "on" || relation === "自己",
            });
        });
        onDone(id);
      }}
    >
      <div className="form-note">
        <Info size={18} />
        档案只用于记录成长，不会创建家人的登录账号。
      </div>
      <Field label="昵称">
        <input
          name="name"
          maxLength={30}
          required
          autoFocus
          placeholder="你希望怎样称呼 TA"
          defaultValue={person?.name ?? (state.persons.length ? "" : "我")}
        />
      </Field>
      {!person && (
        <Field label="关系">
          <select
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
          >
            {["自己", "家人", "孩子", "伴侣", "朋友", "其他"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      )}
      {person && (
        <Field label="今年的一句话方向">
          <input
            name="direction"
            maxLength={120}
            defaultValue={person.direction}
            placeholder="例如：提升专业能力与交付质量"
          />
        </Field>
      )}
      <Field label="简介 / 成长关注点">
        <textarea
          name="note"
          maxLength={500}
          defaultValue={person?.note}
          placeholder="记录关心的事，也允许慢慢找到方向"
          rows={3}
        />
      </Field>
      <Field label="档案时区" hint="行动日期与统计按此时区计算">
        <input
          name="timezone"
          defaultValue={person?.timezone ?? "Asia/Shanghai"}
          required
          placeholder="Asia/Shanghai"
        />
      </Field>
      {!person && relation !== "自己" && (
        <label className="check-row">
          <input type="checkbox" name="consent" required />
          我已获得记录和管理相关信息的授权；儿童档案由监护人管理。
        </label>
      )}
    </Form>
  );
}
export const horizons: Record<D.Horizon, string> = {
  long: "长期方向",
  year: "年度目标",
  quarter: "季度目标",
  custom: "近期目标",
};
export const metrics: Record<D.Metric, string> = {
  increase: "数值增长",
  decrease: "数值降低",
  milestone: "里程碑验收",
  frequency: "有效频次",
  scale: "自定义量表",
};
export function GoalForm({
  state,
  personId,
  goal,
  save,
  onDone,
}: {
  state: D.State;
  personId: string;
  goal?: D.Goal;
  save: Save;
  onDone: () => void;
}) {
  const p = D.personOf(state, personId);
  const date = D.localDate(p.timezone);
  const initial = goal ?? D.defaultGoal(personId, date);
  const [metric, setMetric] = useState<D.Metric>(initial.metric),
    [horizon, setHorizon] = useState<D.Horizon>(initial.horizon),
    [milestones, setMilestones] = useState(
      initial.milestones.length
        ? initial.milestones
        : [{ id: D.uid(), title: "", weight: 1, date: initial.end }],
    );
  const [end, setEnd] = useState(initial.end),
    [start, setStart] = useState(initial.start);
  const [pending, setPending] = useState<{
    goal: D.Goal;
    reason: string;
  } | null>(null);
  if (pending && goal) {
    const preview = structuredClone(state);
    preview.goals = preview.goals.map((g) =>
      g.id === goal.id ? pending.goal : g,
    );
    return (
      <>
        <p className="owner-line">
          所属人物 <Badge tone="green">{p.name}</Badge>
        </p>
        <h3>调整影响预览</h3>
        <div className="detail-facts">
          <p>
            <span>目标值</span>
            {goal.target} → {pending.goal.target} {pending.goal.unit}
          </p>
          <p>
            <span>截止日期</span>
            {goal.end} → {pending.goal.end}
          </p>
          <p>
            <span>统计权重</span>
            {goal.weight} → {pending.goal.weight}
          </p>
          <p>
            <span>当前成果进度</span>
            {D.goalProgress(state, goal) === null
              ? "待补充"
              : Math.round(D.goalProgress(state, goal)! * 100) + "%"}{" "}
            →{" "}
            {D.goalProgress(preview, pending.goal) === null
              ? "待补充"
              : Math.round(D.goalProgress(preview, pending.goal)! * 100) + "%"}
          </p>
          <p>
            <span>年度统计</span>
            {pending.goal.includedInAnnual ? "纳入" : "不纳入"}
          </p>
        </div>
        <p className="muted">
          调整原因：{pending.reason}。已发布复盘保留原版本，现有行动不自动改期。
        </p>
        <Form
          submit="确认生成新版本"
          onSubmit={async () => {
            await save((s) => D.saveGoal(s, pending.goal, pending.reason));
            onDone();
          }}
        >
          <button
            className="text-button"
            type="button"
            onClick={() => setPending(null)}
          >
            返回修改
          </button>
        </Form>
      </>
    );
  }
  return (
    <Form
      submit={goal ? "查看调整影响" : "保存为草稿"}
      onSubmit={async (f) => {
        const g: D.Goal = {
          ...structuredClone(initial),
          title: text(f, "title"),
          domain: text(f, "domain"),
          horizon,
          start,
          end,
          metric,
          baseline:
            metric === "increase" || metric === "decrease"
              ? number(f, "baseline")
              : 0,
          target:
            metric === "increase" ||
            metric === "decrease" ||
            metric === "frequency"
              ? number(f, "target")
              : 100,
          unit: text(f, "unit"),
          weight: number(f, "weight"),
          challenge: f.get("challenge") === "on",
          includedInAnnual: f.get("annual") === "on",
          measurement: (text(f, "measurement") || "latest") as
            | "latest"
            | "delta",
          parentId: text(f, "parent") || undefined,
          aggregation: text(f, "aggregation") as "self" | "children",
          weeklyMinutes: number(f, "weeklyMinutes"),
          cadence: text(f, "cadence") as "linear" | "none",
          freshnessDays: number(f, "freshnessDays"),
          milestones: metric === "milestone" ? milestones : [],
          scaleLabels:
            metric === "scale"
              ? Array.from({ length: 5 }, (_, i) => text(f, "scale" + i))
              : initial.scaleLabels,
        };
        if (goal) {
          D.validateGoal(state, g);
          if (!text(f, "reason")) throw new Error("调整需填写原因");
          setPending({ goal: g, reason: text(f, "reason") });
        } else {
          await save((s) => D.saveGoal(s, g));
          onDone();
        }
      }}
    >
      <p className="owner-line">
        所属人物 <Badge tone="green">{p.name}</Badge>
      </p>
      <Field label="希望实现什么">
        <input
          name="title"
          required
          maxLength={80}
          autoFocus
          defaultValue={initial.title}
          placeholder="用一个可验证的成果描述目标"
        />
      </Field>
      <div className="two-col">
        <Field label="目标周期">
          <select
            value={horizon}
            onChange={(e) => {
              const h = e.target.value as D.Horizon;
              setHorizon(h);
              if (!goal && h === "long")
                setEnd(`${Number(date.slice(0, 4)) + 4}-12-31`);
              if (!goal && h === "year") setEnd(`${date.slice(0, 4)}-12-31`);
            }}
          >
            {Object.entries(horizons).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="成长领域">
          <select name="domain" defaultValue={initial.domain}>
            {[...new Set([...state.settings.domains, initial.domain])].map(
              (d) => (
                <option key={d}>{d}</option>
              ),
            )}
          </select>
        </Field>
      </div>
      <div className="two-col">
        <Field label="开始日期">
          <input
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="截止日期">
          <input
            type="date"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <Field label="如何判断成果">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as D.Metric)}
        >
          {Object.entries(metrics).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {(metric === "increase" || metric === "decrease") && (
        <div className="two-col">
          <Field label="初始基线">
            <input
              type="number"
              step="any"
              name="baseline"
              required
              defaultValue={initial.baseline}
            />
          </Field>
          <Field label="目标值">
            <input
              type="number"
              step="any"
              name="target"
              required
              defaultValue={initial.target}
            />
          </Field>
        </div>
      )}
      {metric === "frequency" && (
        <Field
          label="周期内计划完成次数"
          hint="只累计明确记录的有效次数；行动打卡不会自动改写成果"
        >
          <input
            type="number"
            name="target"
            required
            min="1"
            step="1"
            defaultValue={initial.target}
          />
        </Field>
      )}
      {(metric === "increase" ||
        metric === "decrease" ||
        metric === "frequency") && (
        <Field label="单位">
          <input
            name="unit"
            maxLength={15}
            defaultValue={initial.unit}
            placeholder="例如：本、次、小时"
          />
        </Field>
      )}
      {metric === "scale" && (
        <div className="inset">
          <p>为每个等级写下可判断的标准</p>
          {initial.scaleLabels.map((label, i) => (
            <Field key={i} label={`${i * 25}% 的含义`}>
              <input
                name={"scale" + i}
                defaultValue={label}
                required
                maxLength={100}
              />
            </Field>
          ))}
        </div>
      )}
      {metric === "milestone" && (
        <div className="inset">
          <p>里程碑只有通过验收后才计入成果。</p>
          {milestones.map((m, i) => (
            <div className="milestone-edit" key={m.id}>
              <Field label={`里程碑 ${i + 1}`}>
                <input
                  required
                  maxLength={80}
                  value={m.title}
                  placeholder="可验收的阶段成果"
                  onChange={(e) =>
                    setMilestones((ms) =>
                      ms.map((v) =>
                        v.id === m.id ? { ...v, title: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <div className="two-col">
                <Field label="权重">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={m.weight}
                    onChange={(e) =>
                      setMilestones((ms) =>
                        ms.map((v) =>
                          v.id === m.id
                            ? { ...v, weight: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="验收日期">
                  <input
                    type="date"
                    required
                    value={m.date}
                    onChange={(e) =>
                      setMilestones((ms) =>
                        ms.map((v) =>
                          v.id === m.id ? { ...v, date: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              {milestones.length > 1 && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() =>
                    setMilestones((ms) => ms.filter((v) => v.id !== m.id))
                  }
                >
                  <Trash2 size={16} />
                  移除此里程碑
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setMilestones((ms) => [
                ...ms,
                { id: D.uid(), title: "", weight: 1, date: end },
              ])
            }
          >
            <Plus size={16} />
            添加里程碑
          </button>
        </div>
      )}
      <details className="advanced">
        <summary>关联、权重与时间预算</summary>
        {(metric === "increase" || metric === "decrease") && (
          <Field label="数值记录方式">
            <select name="measurement" defaultValue={initial.measurement}>
              <option value="latest">状态值：取观察时间最新测量</option>
              <option value="delta">累计值：基线加有效增量之和</option>
            </select>
          </Field>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            name="annual"
            defaultChecked={initial.includedInAnnual}
          />
          纳入年度统计（暂停或终止不自动移除）
        </label>
        <Field label="关联上一级目标（可选）">
          <select name="parent" defaultValue={initial.parentId ?? ""}>
            <option value="">独立目标</option>
            {state.goals
              .filter(
                (g) =>
                  g.personId === personId &&
                  g.id !== initial.id &&
                  g.status !== "archived",
              )
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="进度来源">
          <select name="aggregation" defaultValue={initial.aggregation}>
            <option value="self">自身验收指标</option>
            <option value="children">直接子目标加权汇总</option>
          </select>
        </Field>
        <div className="two-col">
          <Field label="统计权重">
            <input
              name="weight"
              type="number"
              min="0.01"
              step="any"
              required
              defaultValue={initial.weight}
            />
          </Field>
          <Field label="每周投入（分钟）">
            <input
              name="weeklyMinutes"
              type="number"
              min="0"
              required
              defaultValue={initial.weeklyMinutes}
            />
          </Field>
        </div>
        <div className="two-col">
          <Field label="预期节奏">
            <select name="cadence" defaultValue={initial.cadence}>
              <option value="none">暂不判断</option>
              <option value="linear">线性推进</option>
            </select>
          </Field>
          <Field label="更新周期（天）">
            <input
              name="freshnessDays"
              type="number"
              min="1"
              required
              defaultValue={initial.freshnessDays}
            />
          </Field>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            name="challenge"
            defaultChecked={initial.challenge}
          />
          这是探索性的挑战目标
        </label>
      </details>
      {!goal && (
        <p className="muted">
          先保存为草稿，确认后在目标详情激活。可以从任一周期开始，不必填满所有层级。
        </p>
      )}
      {goal && (
        <Field
          label="调整原因"
          hint="将生成新版本，已发布复盘的历史数据保持不变"
        >
          <textarea
            name="reason"
            required
            maxLength={1000}
            rows={2}
            placeholder="哪些新情况促成了这次调整？"
          />
        </Field>
      )}
    </Form>
  );
}
export const repeats: Record<D.RepeatKind, string> = {
  once: "一次性任务",
  daily: "每日",
  weekdays: "每周指定星期",
  weekly: "每周 N 次",
  monthly: "每月指定日",
  interval: "自定义间隔",
};
export function ActionForm({
  state,
  personId,
  goalId,
  fixed = false,
  save,
  onDone,
}: {
  state: D.State;
  personId: string;
  goalId?: string;
  fixed?: boolean;
  save: Save;
  onDone: () => void;
}) {
  const p = D.personOf(state, personId);
  const [kind, setKind] = useState<D.RepeatKind>(fixed ? "daily" : "once");
  const [weekdays, setWeekdays] = useState([1, 3, 5]);
  const [remind, setRemind] = useState(fixed);
  return (
    <Form
      submit="添加行动"
      onSubmit={async (f) => {
        const a: D.Action = {
          id: D.uid(),
          personId,
          goalId: text(f, "goal") || undefined,
          title: text(f, "title"),
          date: text(f, "date"),
          end: text(f, "end") || undefined,
          minutes: number(f, "minutes"),
          reminderTime: remind ? text(f, "reminderTime") : undefined,
          paused: false,
          repeat: {
            kind,
            weekdays,
            count: kind === "weekly" ? number(f, "count") : 1,
            monthDay: kind === "monthly" ? number(f, "monthDay") : 1,
            interval: kind === "interval" ? number(f, "interval") : 1,
            version: 1,
          },
          createdAt: D.now(),
          updatedAt: D.now(),
        };
        await save((s) => D.saveAction(s, a));
        if (remind) window.BlueprintNative?.enablePlanNotifications();
        onDone();
      }}
    >
      <p className="owner-line">
        所属人物 <Badge tone="green">{p.name}</Badge>
      </p>
      <Field label="下一步做什么">
        <input
          name="title"
          required
          maxLength={80}
          autoFocus
          placeholder="写得具体一点，开始会更容易"
        />
      </Field>
      <Field label="关联目标（可选）">
        <select name="goal" defaultValue={goalId ?? ""}>
          <option value="">独立行动</option>
          {state.goals
            .filter((g) => g.personId === personId && g.status === "active")
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
        </select>
      </Field>
      <div className="two-col">
        <Field label="计划日期">
          <input
            name="date"
            type="date"
            required
            defaultValue={D.localDate(p.timezone)}
          />
        </Field>
        <Field label="预计耗时（分钟）">
          <input
            name="minutes"
            type="number"
            required
            min="0"
            max="1440"
            defaultValue={25}
          />
        </Field>
      </div>
      <Field label="重复规则">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as D.RepeatKind)}
        >
          {Object.entries(repeats).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {kind === "weekdays" && (
        <div className="weekday-picker" role="group" aria-label="重复星期">
          {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
            <button
              type="button"
              aria-pressed={weekdays.includes(i)}
              className={weekdays.includes(i) ? "chosen" : ""}
              key={i}
              onClick={() =>
                setWeekdays((ds) =>
                  ds.includes(i) ? ds.filter((v) => v !== i) : [...ds, i],
                )
              }
            >
              {d}
            </button>
          ))}
        </div>
      )}
      {kind === "weekly" && (
        <Field
          label="每周次数"
          hint="按整周安排，未到周末的剩余次数不会判为逾期；每天最多完成一次"
        >
          <input
            name="count"
            type="number"
            min="1"
            max="7"
            required
            defaultValue="3"
          />
        </Field>
      )}
      {kind === "monthly" && (
        <Field label="每月几号" hint="短月没有该日期时跳过">
          <input
            name="monthDay"
            type="number"
            min="1"
            max="31"
            required
            defaultValue="1"
          />
        </Field>
      )}
      {kind === "interval" && (
        <Field label="每隔多少天">
          <input
            name="interval"
            type="number"
            min="1"
            max="365"
            required
            defaultValue="2"
          />
        </Field>
      )}
      {kind !== "once" && (
        <Field label="结束日期（可选）">
          <input name="end" type="date" />
        </Field>
      )}
      <label className="check-line">
        <input
          type="checkbox"
          checked={remind}
          onChange={(e) => setRemind(e.target.checked)}
        />
        到时间提醒我
      </label>
      {remind && (
        <Field
          label="此计划提醒时间"
          hint={`按${p.name}的时区 ${p.timezone} 提醒；每周 N 次在未完成时每日提醒，其他规则只在计划日提醒。`}
        >
          <input
            type="time"
            name="reminderTime"
            required
            defaultValue="09:00"
          />
        </Field>
      )}
      {remind && (
        <p className="muted">
          保存后请在设置中允许系统通知。开启“准时提醒”可提高时间准确性；省电、关机或强制停止可能延迟提醒。
        </p>
      )}
    </Form>
  );
}
export function RecordForm({
  state,
  personId,
  goalId,
  save,
  onDone,
}: {
  state: D.State;
  personId: string;
  goalId?: string;
  save: Save;
  onDone: () => void;
}) {
  const p = D.personOf(state, personId);
  const [selected, setSelected] = useState(goalId ?? "");
  const goal = state.goals.find((g) => g.id === selected);
  const date = D.localDate(p.timezone);
  const [dateValue, setDateValue] = useState(date);
  const [files, setFiles] = useState<
      Omit<D.Attachment, "personId" | "observationId">[]
    >([]),
    [fileError, setFileError] = useState("");
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.error) {
        setFileError(detail.error);
        return;
      }
      prepareAttachment(fromBase64(detail.data), detail.name)
        .then((file) => {
          setFiles((fs) => [...fs, file]);
          setFileError("");
        })
        .catch((e) => setFileError(e.message));
    };
    window.addEventListener("blueprint-attachment", handler);
    return () => window.removeEventListener("blueprint-attachment", handler);
  }, []);
  return (
    <Form
      submit="保存进展"
      onSubmit={async (f) => {
        const eventTime =
          text(f, "occurred") === "now"
            ? D.now()
            : new Date(text(f, "eventTime")).toISOString();
        await save((s) => {
          const id = D.addObservation(s, {
            personId,
            goalId: selected || undefined,
            text: text(f, "text") || (files.length ? "新增成果附件" : ""),
            value:
              goal && text(f, "value") !== "" ? number(f, "value") : undefined,
            eventTime,
          });
          for (const file of files)
            D.addAttachment(s, { ...file, personId, observationId: id });
        });
        onDone();
      }}
    >
      <p className="owner-line">
        所属人物 <Badge tone="green">{p.name}</Badge>
      </p>
      <Field label="记录到哪个目标">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">一条成长心得</option>
          {state.goals
            .filter(
              (g) =>
                g.personId === personId &&
                g.status !== "draft" &&
                g.status !== "archived",
            )
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
        </select>
      </Field>
      {goal && goal.metric !== "milestone" && goal.aggregation === "self" && (
        <Field
          label={
            goal.metric === "frequency"
              ? "本次有效次数"
              : goal.metric === "scale"
                ? "当前达到的等级"
                : `${goal.measurement === "delta" ? "本次指标增量" : "当前指标数值"}${goal.unit ? "（" + goal.unit + "）" : ""}`
          }
          hint={
            goal.metric === "frequency"
              ? "每条独立记录累加；避免重复录入同一次成果"
              : "记录实际成果，不会由行动完成次数自动换算"
          }
        >
          {goal.metric === "scale" ? (
            <select name="value">
              <option value="">暂不更新数值</option>
              {goal.scaleLabels.map((l, i) => (
                <option value={i * 25} key={i}>
                  {i * 25}% · {l}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={goal.id}
              type="number"
              step={goal.metric === "frequency" ? "1" : "any"}
              name="value"
              placeholder={
                goal.metric === "frequency"
                  ? "例如：1"
                  : "填写本次测量值（可选）"
              }
            />
          )}
        </Field>
      )}
      <Field label="有什么进展、收获或阻碍">
        <textarea
          name="text"
          maxLength={10000}
          rows={4}
          placeholder="记录一件有意义的小事，也可以写下遇到的困难"
          autoFocus
        />
      </Field>
      <Field
        label="成果证据附件"
        hint="PNG、JPEG、PDF；单个不超过 5MB，空间附件合计不超过 10MB。随数据加密保存与备份"
      >
        {window.BlueprintNative ? (
          <button
            type="button"
            className="button ghost"
            onClick={() => window.BlueprintNative!.importAttachment()}
          >
            选择图片或 PDF
          </button>
        ) : (
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error("附件超过 5MB");
                const prepared = await prepareAttachment(
                  new Uint8Array(await file.arrayBuffer()),
                  file.name,
                );
                setFiles((fs) => [...fs, prepared]);
                setFileError("");
              } catch (e) {
                setFileError((e as Error).message);
              }
            }}
          />
        )}
      </Field>
      {files.map((file) => (
        <div className="list-row" key={file.id}>
          <span>
            {file.name} <small>{Math.ceil(file.size / 1024)} KB</small>
          </span>
          <button
            type="button"
            className="text-button danger"
            onClick={() => setFiles((fs) => fs.filter((f) => f.id !== file.id))}
          >
            移除
          </button>
        </div>
      ))}
      {fileError && (
        <p className="error-box" role="alert">
          {fileError}
        </p>
      )}
      <details className="advanced">
        <summary>补录过去发生的进展</summary>
        <Field label="记录方式">
          <select
            name="occurred"
            onChange={(e) =>
              setDateValue(e.target.value === "now" ? date : "past")
            }
          >
            <option value="now">刚刚发生</option>
            <option value="past">补录</option>
          </select>
        </Field>
        <Field
          label="发生时间"
          hint="按当前设备时区输入；发生时间早的补录不会覆盖较新的状态测量"
        >
          <input
            name="eventTime"
            type="datetime-local"
            defaultValue={new Date(
              Date.now() - new Date().getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16)}
            required={dateValue === "past"}
          />
        </Field>
      </details>
    </Form>
  );
}
export function ReviewForm({
  state,
  personId,
  previous,
  save,
  onDone,
}: {
  state: D.State;
  personId: string;
  previous?: D.Review;
  save: Save;
  onDone: () => void;
}) {
  const p = D.personOf(state, personId);
  const [period, setPeriod] = useState<D.Review["period"]>(
    previous?.period ?? "week",
  );
  const [date, setDate] = useState(previous?.start ?? D.localDate(p.timezone));
  const [start, end] = D.periodRange(period, date);
  const snapshot = D.reviewSnapshot(state, personId, start, end);
  const [draft, setDraft] = useState(previous?.status === "draft");
  return (
    <Form
      submit={draft ? "保存草稿" : "发布复盘"}
      onSubmit={async (f) => {
        const prior = state.reviews
          .filter(
            (r) =>
              r.personId === personId &&
              r.period === period &&
              r.start === start &&
              r.status === "published",
          )
          .sort((a, b) => b.revision - a.revision)[0];
        const r: D.Review = {
          id: previous?.status === "draft" ? previous.id : D.uid(),
          personId,
          period,
          start,
          end,
          wins: text(f, "wins"),
          obstacles: text(f, "obstacles"),
          methods: text(f, "methods"),
          next: text(f, "next")
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean),
          status: draft ? "draft" : "published",
          revision:
            previous?.status === "draft"
              ? previous.revision
              : (prior?.revision ?? 0) + 1,
          previousId:
            previous?.status === "published" ? previous.id : prior?.id,
          snapshot,
          createdAt: D.now(),
        };
        await save(
          (s) => D.saveReview(s, r),
          draft ? "复盘草稿已保存在本机" : "复盘已发布，统计快照已冻结",
        );
        onDone();
      }}
    >
      <p className="owner-line">
        所属人物 <Badge tone="green">{p.name}</Badge>
      </p>
      <div className="two-col">
        <Field label="复盘周期">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as D.Review["period"])}
          >
            {[
              ["week", "每周"],
              ["month", "每月"],
              ["quarter", "每季度"],
              ["year", "每年"],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="周期内的日期">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="fact-panel">
        <span>
          本期事实 · {start} ～ {end}
        </span>
        <strong>
          {snapshot.completed}
          <small> / {snapshot.due} 项到期行动</small>
        </strong>
        <p>
          {snapshot.goalProgress.length} 个目标 ·{" "}
          {snapshot.observationIds.length} 条进展记录
        </p>
      </div>
      <Field label="最有价值的进展">
        <textarea
          name="wins"
          rows={3}
          maxLength={10000}
          defaultValue={previous?.wins}
          placeholder="哪些投入带来了真实的改变？"
        />
      </Field>
      <Field label="主要阻碍及原因">
        <textarea
          name="obstacles"
          rows={2}
          maxLength={10000}
          defaultValue={previous?.obstacles}
          placeholder="什么影响了推进，背后可能是什么原因？"
        />
      </Field>
      <Field label="哪些方法要保留或停止">
        <textarea
          name="methods"
          rows={2}
          maxLength={10000}
          defaultValue={previous?.methods}
          placeholder="继续有效的方法，给无效的方法留出调整空间"
        />
      </Field>
      <Field
        label="下周期最多三个重点"
        hint="每行一项。发布后可逐项确认并转为行动"
      >
        <textarea
          name="next"
          rows={3}
          maxLength={1000}
          defaultValue={previous?.next.join("\n")}
          placeholder={"一个可开始的重点\n也可以安排休整"}
        />
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft}
          onChange={(e) => setDraft(e.target.checked)}
        />
        先存为草稿
      </label>
      <p className="muted">
        发布后保留当时的目标版本和统计快照；补录和调整将通过修订版反映。
      </p>
    </Form>
  );
}
