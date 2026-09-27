"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de código de verificação em "quadradinhos" — uma caixa por dígito.
 *
 * `onChange` devolve apenas os dígitos preenchidos, concatenados e sem
 * separadores, para o consumidor poder validar `value.length === length` e
 * enviar o valor tal como está (ex.: `POST /api/auth/verify-email-code`).
 *
 * Comportamento: avanço automático ao escrever, um Backspace limpa o dígito e
 * recua, as setas (e Home/End) navegam, colar/autofill distribui os dígitos a
 * partir da caixa colada e Enter submete o formulário em volta.
 */
export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Número de caixas/dígitos (padrão: 6). */
  length?: number;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  className?: string;
  /**
   * Chamado quando o código fica completo **e diferente** do último já submetido
   * (auto-submissão). Não repete o aviso enquanto o valor não mudar — evita
   * submeter duas vezes o mesmo código — e volta a disparar quando o valor é
   * limpo de fora ou um dígito é corrigido.
   */
  onComplete?: (code: string) => void;
}

/** Só dígitos — cobre colar "123 456", "123-456" ou "123.456". */
const onlyDigits = (text: string) => text.replace(/\D/g, "");

/** Distribui um texto pelos quadradinhos a partir do início ("" = vazio). */
function toCells(value: string, length: number): string[] {
  const digits = onlyDigits(value).slice(0, length);
  return Array.from({ length }, (_, i) => digits[i] ?? "");
}

const boxBase =
  "aspect-square w-full min-w-0 flex-1 max-w-14 rounded-xl border bg-surface text-center font-display text-lg font-bold tabular-nums text-slate-900 transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 sm:text-xl";

export function OtpInput({
  value,
  onChange,
  length = 6,
  label,
  error,
  hint,
  disabled,
  autoFocus,
  required,
  className,
  onComplete,
}: OtpInputProps) {
  const groupId = useId();
  const labelId = `${groupId}-label`;
  const errorId = `${groupId}-error`;
  const hintId = `${groupId}-hint`;

  const [cells, setCells] = useState<string[]>(() => toCells(value, length));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Último valor emitido por nós: distingue uma alteração do utilizador de uma
  // alteração vinda de fora (limpeza/preenchimento pelo componente pai).
  const lastEmitted = useRef(value);
  const autoFocused = useRef(false);
  // Último código completo já submetido por auto-submissão ("" = nenhum).
  const submittedRef = useRef("");

  // Ressincroniza quando o valor é imposto de fora (ex.: o pai faz setValue("")).
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setCells(toCells(value, length));
    // Valor imposto de fora (ex.: campo limpo após confirmar): liberta a
    // auto-submissão para o código seguinte.
    submittedRef.current = "";
  }, [value, length]);

  const focusCell = useCallback(
    (index: number) => {
      const el = refs.current[Math.max(0, Math.min(index, length - 1))];
      if (!el) return;
      el.focus();
      el.select();
    },
    [length],
  );

  const commit = (next: string[]) => {
    const joined = next.join("");
    lastEmitted.current = joined;
    setCells(next);
    onChange(joined);
    // `joined.length` só iguala `length` com todos os quadradinhos preenchidos
    // (as casas vazias não entram na junção).
    if (joined.length === length && joined !== submittedRef.current) {
      submittedRef.current = joined;
      onComplete?.(joined);
    }
  };

  /** Escreve uma sequência de dígitos a partir de `start` (colar/autofill). */
  const writeFrom = (start: number, text: string) => {
    const digits = onlyDigits(text);
    if (!digits) return;
    const next = [...cells];
    let i = start;
    for (const digit of digits) {
      if (i >= length) break;
      next[i] = digit;
      i += 1;
    }
    commit(next);
    focusCell(i);
  };

  const clearAt = (index: number) => {
    const next = [...cells];
    next[index] = "";
    commit(next);
  };

  const handleChange = (index: number, raw: string) => {
    const typed = onlyDigits(raw);
    if (typed.length === 0) {
      clearAt(index);
      return;
    }
    // Vários dígitos numa caixa (colar, autofill ou teclar sobre um dígito já
    // preenchido): distribui a partir desta caixa.
    if (typed.length > 1) {
      writeFrom(index, typed);
      return;
    }
    const next = [...cells];
    next[index] = typed;
    commit(next);
    focusCell(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Backspace":
        if (cells[index]) {
          clearAt(index);
        } else if (index > 0) {
          clearAt(index - 1);
          focusCell(index - 1);
        }
        event.preventDefault();
        return;
      case "Delete":
        clearAt(index);
        event.preventDefault();
        return;
      case "ArrowLeft":
        focusCell(index - 1);
        event.preventDefault();
        return;
      case "ArrowRight":
        focusCell(index + 1);
        event.preventDefault();
        return;
      case "Home":
        focusCell(0);
        event.preventDefault();
        return;
      case "End":
        focusCell(length - 1);
        event.preventDefault();
        return;
      case "Enter":
        // Com várias caixas, o browser já não submete o formulário sozinho.
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
        return;
      default:
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = onlyDigits(event.clipboardData.getData("text"));
    if (!text) return;
    event.preventDefault();
    writeFrom(index, text);
  };

  useEffect(() => {
    if (!autoFocus || autoFocused.current) return;
    autoFocused.current = true;
    const firstEmpty = cells.findIndex((cell) => !cell);
    focusCell(firstEmpty === -1 ? length - 1 : firstEmpty);
  }, [autoFocus, cells, focusCell, length]);

  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span id={labelId} className="text-sm font-medium text-slate-700">
          {label}
          {/* `red-600` (4,8:1): o asterisco é conteúdo, não decoração. */}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
      )}

      <div
        role="group"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : "Código de verificação"}
        className="flex gap-2"
      >
        {cells.map((cell, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={cell}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.currentTarget.select()}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Dígito ${index + 1} de ${length}`}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className={cn(
              boxBase,
              error
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                : "border-slate-300 focus:border-primary-500 focus:ring-primary-500/15",
            )}
          />
        ))}
      </div>

      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
