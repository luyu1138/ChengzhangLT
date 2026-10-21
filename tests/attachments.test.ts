import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../src/domain.ts";
import { prepareAttachment } from "../src/attachments.ts";
import { recoveryCode, encryptBackup, decryptBackup } from "../src/backup.ts";
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBn8AAAAASUVORK5CYII=",
    "base64",
  ),
);
test("attachments are encrypted in backup and verified during restore", async () => {
  const s = D.emptyState();
  const personId = D.createPerson(s, {
    name: "我",
    relation: "自己",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  const observationId = D.addObservation(s, {
    personId,
    text: "图片证据",
    eventTime: D.now(),
  });
  const file = await prepareAttachment(png, "成果.png");
  D.addAttachment(s, { ...file, personId, observationId });
  const code = recoveryCode();
  const bytes = await encryptBackup(s, code);
  assert.ok(!new TextDecoder().decode(bytes).includes(file.data));
  const imported = await decryptBackup(bytes, code);
  assert.equal(imported.attachments[0].sha256, file.sha256);
  assert.equal(imported.attachments[0].data, file.data);
});
test("wrong attachment digest and unsupported file content are rejected", async () => {
  await assert.rejects(
    prepareAttachment(
      new TextEncoder().encode("<script>alert(1)</script>"),
      "fake.png",
    ),
    /不匹配/,
  );
  const s = D.emptyState();
  const personId = D.createPerson(s, {
    name: "我",
    relation: "自己",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  const observationId = D.addObservation(s, {
    personId,
    text: "文件",
    eventTime: D.now(),
  });
  D.addAttachment(s, {
    ...(await prepareAttachment(png, "成果.png")),
    personId,
    observationId,
    sha256: "0".repeat(64),
  });
  const code = recoveryCode();
  await assert.rejects(
    decryptBackup(await encryptBackup(s, code), code),
    /摘要校验失败/,
  );
});
test("import rejects pathological repeat counts before rendering instances", () => {
  const s = D.emptyState();
  const personId = D.createPerson(s, {
    name: "我",
    relation: "自己",
    note: "",
    timezone: "Asia/Shanghai",
    consent: true,
  });
  s.actions.push({
    id: D.uid(),
    personId,
    title: "超量",
    date: D.localDate(),
    minutes: 0,
    paused: false,
    repeat: {
      kind: "weekly",
      count: 1000000000,
      weekdays: [],
      monthDay: 1,
      interval: 1,
      version: 1,
    },
    createdAt: D.now(),
    updatedAt: D.now(),
  });
  assert.throws(() => D.validateState(s), /行动数据无效/);
});
