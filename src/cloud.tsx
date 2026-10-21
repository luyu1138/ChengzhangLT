import { useCallback, useEffect, useState } from "react";
import { CloudUpload, RefreshCw, ShieldCheck, Bell } from "lucide-react";
import { Badge, Field, Form, text } from "./components";
import { recoveryCode } from "./backup";
import "./storage";

export interface CloudStatus {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  running: boolean;
  bucket?: string;
  region?: string;
  endpoint?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastObjectKey?: string;
  lastRevision?: number;
  message?: string;
}
const offline: CloudStatus = {
  ok: true,
  configured: false,
  enabled: false,
  running: false,
};
export function useCloudStatus() {
  const [status, setStatus] = useState<CloudStatus>(offline);
  const refresh = useCallback(() => {
    try {
      const raw = window.BlueprintNative?.ossStatus();
      setStatus(raw ? JSON.parse(raw) : offline);
    } catch {
      setStatus({
        ...offline,
        ok: false,
        message: "无法读取 OSS 备份状态，请重新打开应用",
      });
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return { status, refresh };
}
function check(result?: string) {
  if (!result) throw new Error("请在 Android 应用内配置此功能");
  const parsed = JSON.parse(result);
  if (!parsed.ok) throw new Error(parsed.message || "操作未成功，请重试");
  return parsed;
}
export function CloudPanel({
  status,
  refresh,
}: {
  status: CloudStatus;
  refresh: () => void;
}) {
  const [code] = useState(recoveryCode);
  const [revealed, setRevealed] = useState("");
  const [message, setMessage] = useState("");
  const [configurationSaved, setConfigurationSaved] = useState(false);
  const [error, setError] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const act = (action: () => string | undefined, success: string) => {
    try {
      setError("");
      check(action());
      setMessage(success);
      setConfigurationSaved(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };
  return (
    <div className="cloud-config">
      <div className="form-note">
        <CloudUpload size={25} />
        <div>
          <strong>每天自动上传到阿里云 OSS</strong>
          <p>
            上传完整空间的加密备份，包含所有人物、计划、完成记录和附件。每天每台设备一份，同日再次备份会替换该文件；不同设备分目录保存。
          </p>
        </div>
      </div>
      <Badge
        tone={
          status.lastError || !status.ok
            ? "amber"
            : status.lastSuccessAt
              ? "green"
              : "neutral"
        }
      >
        {!status.ok
          ? "配置读取失败"
          : status.running
            ? "正在上传并回读校验"
            : !status.configured
              ? "尚未配置 · 自动上传未启用"
              : !status.enabled
                ? "每日备份已暂停"
                : status.lastError
                  ? "最近备份失败 · 等待重试"
                  : status.lastSuccessAt
                    ? "已启用每日备份"
                    : "已安排 · 等待首次备份"}
      </Badge>
      <div className="detail-facts">
        <p>
          <span>最近成功</span>
          {status.lastSuccessAt
            ? new Date(status.lastSuccessAt).toLocaleString("zh-CN")
            : "尚无成功备份"}
        </p>
        {status.bucket && (
          <p>
            <span>Bucket / 地域</span>
            {status.bucket} / {status.region}
          </p>
        )}
        {status.lastObjectKey && (
          <p>
            <span>备份路径</span>
            {status.lastObjectKey}
          </p>
        )}
      </div>
      {(status.lastError || status.message || error) && (
        <p className="error-box" role="alert">
          {error || status.message || status.lastError}
        </p>
      )}
      {message &&
        !(configurationSaved && (status.lastError || status.lastSuccessAt)) && (
          <p role="status" className="form-note">
            {message}
          </p>
        )}
      {!window.BlueprintNative && (
        <p className="warning-box">
          浏览器仅预览界面；请在 Android APK 内配置每日后台备份。
        </p>
      )}
      <Form
        submit={status.configured ? "保存并启用每日备份" : "启用每日 OSS 备份"}
        onSubmit={async (f) => {
          check(
            window.BlueprintNative?.configureOss(
              JSON.stringify({
                bucket: text(f, "bucket"),
                region: text(f, "region"),
                accessKeyId,
                accessKeySecret,
                recoveryCode: status.configured ? "" : code,
                recoverySaved: f.get("recoverySaved") === "on",
              }),
            ),
          );
          setAccessKeyId("");
          setAccessKeySecret("");
          setError("");
          setConfigurationSaved(true);
          setMessage(
            "配置已安全保存，首次备份将在网络可用、系统允许时执行。成功前请继续保留本机数据。",
          );
          refresh();
        }}
      >
        <Field
          label="OSS Bucket 名称"
          hint="使用私有 Bucket；只填写名称，不含 https:// 或路径。"
        >
          <input
            key={status.bucket}
            name="bucket"
            required
            pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
            defaultValue={status.bucket ?? ""}
            placeholder="例如 my-growth-blueprint"
            autoComplete="off"
          />
        </Field>
        <Field
          label="OSS 地域"
          hint="填写 Bucket 实际地域，例如 cn-hangzhou；Endpoint 会按地域自动生成。"
        >
          <input
            key={status.region}
            name="region"
            required
            defaultValue={status.region ?? "cn-hangzhou"}
            placeholder="cn-hangzhou"
            autoComplete="off"
          />
        </Field>
        <Field
          label="RAM AccessKey ID"
          hint={
            status.configured
              ? "留空保留现有凭据；更换时填写新的 ID 和 Secret。"
              : "使用只允许备份目录读写的专用 RAM 用户。"
          }
        >
          <input
            name="accessKeyId"
            required={!status.configured}
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value.trim())}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="RAM AccessKey Secret">
          <input
            name="accessKeySecret"
            type="password"
            required={!status.configured}
            value={accessKeySecret}
            onChange={(e) => setAccessKeySecret(e.target.value.trim())}
            autoComplete="new-password"
          />
        </Field>
        {!status.configured && (
          <>
            <Field
              label="OSS 备份恢复码"
              hint="先单独抄写或保存。换机后从 OSS 下载 .gbp 文件，用此码在“备份恢复”中导入。"
            >
              <input
                readOnly
                value={code}
                className="recovery-code"
                spellCheck={false}
              />
            </Field>
            <label className="check-line">
              <input name="recoverySaved" type="checkbox" required />
              我已单独保存恢复码，理解丢失后无法解密云端备份
            </label>
          </>
        )}
        <p className="muted">
          凭据与恢复码仅加密保存在这台手机，不包含在业务备份中。每日任务使用可用网络（含移动网络），失败后重试；省电、关机或强制停止可能延迟执行，重新打开应用会补试。
        </p>
      </Form>
      {status.configured && (
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!status.enabled || status.running}
            onClick={() =>
              act(
                () => window.BlueprintNative?.backupNow(),
                "已安排立即备份；无网络时等待联网。可刷新查看结果。",
              )
            }
          >
            <CloudUpload size={18} />
            立即备份
          </button>
          <button
            className="button secondary"
            onClick={() =>
              act(
                () => window.BlueprintNative?.disableOss(),
                "每日备份已暂停；云端已有文件不会删除。",
              )
            }
          >
            暂停每日备份
          </button>
          <button
            className="text-button"
            onClick={() => {
              try {
                setRevealed(
                  check(window.BlueprintNative?.ossRecoveryCode()).code,
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "无法读取");
              }
            }}
          >
            查看恢复码
          </button>
        </div>
      )}
      {(status.configured || !status.ok) && (
        <button
          className="text-button danger"
          onClick={() => {
            if (
              window.confirm(
                "先单独保存恢复码。移除本机 OSS 凭据和恢复码后，云端已有备份仍会保留，且只能用原恢复码解密。确认移除？",
              )
            ) {
              setRevealed("");
              act(
                () => window.BlueprintNative?.forgetOss(),
                "本机 OSS 配置已移除，云端文件未删除。",
              );
            }
          }}
        >
          移除本机配置
        </button>
      )}
      {revealed && (
        <div>
          <p className="recovery-code">{revealed}</p>
          <button className="text-button" onClick={() => setRevealed("")}>
            隐藏恢复码
          </button>
        </div>
      )}
      <button className="text-button" onClick={refresh}>
        <RefreshCw size={16} />
        刷新备份状态
      </button>
      <div className="form-note">
        <ShieldCheck size={22} />
        <p>
          这是每日备份，不会自动下载或合并其他设备的数据。恢复：从 OSS
          控制台下载对应 .gbp 文件，再到“备份恢复”验证并导入。历史文件计入 OSS
          用量，可在控制台设置生命周期。
        </p>
      </div>
    </div>
  );
}
export function PlanReminderSettings() {
  const [status, setStatus] = useState<{
    notifications: boolean;
    exact: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => {
      try {
        const raw = window.BlueprintNative?.reminderStatus();
        if (raw) setStatus(check(raw));
      } catch {
        /* Browser preview has no OS permission state. */
      }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="form-note">
      <Bell size={22} />
      <div>
        <strong>个人固定计划提醒</strong>
        <p>
          在“行动 →
          添加固定计划”设置每日、指定星期或每月日期及提醒时间。按该人物的时区提醒，完成或暂停后会取消对应提醒。
        </p>
        <p>
          {status
            ? `系统通知：${status.notifications ? "已允许" : "未允许"}；准时提醒：${status.exact ? "已允许" : "由系统调度，可能延迟"}`
            : "请在 Android 应用内授权系统通知。"}
        </p>
        <div className="button-row">
          <button
            className="text-button"
            onClick={() => {
              try {
                check(window.BlueprintNative?.enablePlanNotifications());
                setMessage("请完成系统授权；已有计划会重新安排提醒。");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "设置失败");
              }
            }}
          >
            允许计划通知
          </button>
          <button
            className="text-button"
            onClick={() => {
              if (!window.BlueprintNative) {
                setMessage("请在 Android 应用内设置");
                return;
              }
              window.BlueprintNative.requestExactReminders();
              setMessage("在系统页面允许准时提醒后返回应用。");
            }}
          >
            开启准时提醒
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </div>
  );
}
