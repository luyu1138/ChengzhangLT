import {
  useState,
  useEffect,
  useRef,
  useId,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, ChevronDown, ArrowRight, LoaderCircle } from "lucide-react";
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      old?.focus();
    };
  }, [title]);
  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const els = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select,textarea,summary,[tabindex="0"]',
              ) ?? [],
            ).filter((el) => el.getClientRects().length);
            const first = els[0],
              last = els.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const hintId = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          "aria-label"?: string;
          "aria-describedby"?: string;
        }>,
        { "aria-label": label, "aria-describedby": hint ? hintId : undefined },
      )
    : children;
  return (
    <label className="field">
      <span>{label}</span>
      {control}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
export function Form({
  children,
  onSubmit,
  submit = "保存",
  secondary,
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  submit?: string;
  secondary?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await onSubmit(data);
        } catch (e) {
          setError(e instanceof Error ? e.message : "保存失败，请重试");
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        {secondary}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : null}
          {busy ? "正在保存" : submit}
          {!busy && <ArrowRight size={18} />}
        </button>
      </div>
    </form>
  );
}
export function Select({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <span className="select-wrap">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {children}
      </select>
      <ChevronDown size={16} />
    </span>
  );
}
export function Empty({
  icon,
  title,
  body,
  button,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  button?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {button && (
        <button className="button primary" onClick={onClick}>
          {button}
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "neutral" | "red";
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Progress({
  value,
  small = false,
}: {
  value: number | null;
  small?: boolean;
}) {
  return (
    <div
      className={"progress " + (small ? "small" : "")}
      role="progressbar"
      aria-label="成果进度"
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{ width: (value === null ? 0 : Math.round(value * 100)) + "%" }}
      />
    </div>
  );
}
export const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const number = (f: FormData, k: string) => {
  const v = text(f, k);
  return v === "" ? NaN : Number(v);
};
