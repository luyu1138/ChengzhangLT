import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import * as D from "../src/domain.ts";
import { decryptBackup } from "../src/backup.ts";

const directory = process.argv[3];
const code = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // Public test-only key.
if (process.argv[2] === "prepare") {
  const state = D.emptyState();
  const personId = D.createPerson(state, {
    name: "互操作测试人物",
    relation: "自己",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  const rules: unknown[] = [];
  for (const kind of [
    "once",
    "daily",
    "weekdays",
    "weekly",
    "monthly",
    "interval",
  ] as const) {
    const action: D.Action = {
      id: D.uid(),
      personId,
      title: kind,
      date: "2026-01-01",
      minutes: 20,
      reminderTime: "09:00",
      paused: false,
      repeat: {
        kind,
        weekdays: [1, 3, 5],
        count: 2,
        monthDay: 31,
        interval: 3,
        version: 1,
      },
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: D.now(),
    };
    D.saveAction(state, action);
    for (const date of [
      "2026-01-01",
      "2026-02-28",
      "2026-03-01",
      "2026-03-31",
      "2026-10-21",
      "2026-11-30",
      "2028-02-29",
    ])
      rules.push({ action, date, expected: D.scheduled(action, date) });
  }
  await writeFile(`${directory}/state.json`, JSON.stringify(state));
  await writeFile(`${directory}/rules.json`, JSON.stringify(rules));
} else {
  const expected = JSON.parse(
    await readFile(`${directory}/state.json`, "utf8"),
  );
  const bytes = new Uint8Array(await readFile(`${directory}/native.gbp`));
  const recovered = await decryptBackup(bytes, code);
  assert.deepEqual(recovered, expected);
  const damaged = JSON.parse(new TextDecoder().decode(bytes));
  damaged.data = (damaged.data[0] === "A" ? "B" : "A") + damaged.data.slice(1);
  await assert.rejects(
    decryptBackup(new TextEncoder().encode(JSON.stringify(damaged)), code),
    /恢复码错误或文件已损坏/,
  );
  console.log(
    "PASS native encrypted backup imports through the actual TypeScript restore validator",
  );
  console.log("PASS tampered native backup is rejected before import");
}
