export const STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_PRECO: "Aguardando preço",
  RESPONDIDA: "Respondida",
  FECHADA: "Fechada",
  PERDIDA: "Perdida",
  CANCELADA: "Cancelada",
};

export const STATUS_EMOJI: Record<string, string> = {
  AGUARDANDO_PRECO: "⏳",
  RESPONDIDA: "💰",
  FECHADA: "✅",
  PERDIDA: "❌",
  CANCELADA: "🚫",
};

/** Converte número escrito em pt-BR ("1.234,56", "9,85", "9.85") */
export function parseNumeroBR(txt: string): number | null {
  let s = txt.trim().replace(/[R$\s]/gi, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "25000", "25.000 kg", "25 t", "1,5 ton" → kg */
export function parseQuantidadeKg(txt: string): number | null {
  const m = txt
    .trim()
    .toLowerCase()
    .match(/^([\d.,]+)\s*(kg|quilos?|t|ton|tons|tonelada|toneladas)?\.?$/);
  if (!m) return null;
  const n = parseNumeroBR(m[1]);
  if (n === null || n <= 0) return null;
  const unidade = m[2] || "kg";
  return unidade.startsWith("t") ? n * 1000 : n;
}

export function fmtNum(n: number | null | undefined, casas = 0): string {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function fmtKg(n: number): string {
  return n >= 1000 && n % 1000 === 0 ? `${fmtNum(n / 1000)} t` : `${fmtNum(n)} kg`;
}

export function fmtMoeda(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined) return "-";
  return "R$ " + fmtNum(n, casas);
}

/** Preço por kg: mínimo 2, máximo 4 casas */
export function fmtPreco(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function fmtData(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Só dígitos; números BR sem DDI recebem 55 */
export function normalizarTelefone(txt: string): string {
  let d = (txt || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

/** Variações com/sem o nono dígito, pois o WhatsApp às vezes entrega sem ele */
export function variantesTelefone(tel: string): string[] {
  const d = normalizarTelefone(tel);
  const v = new Set([d]);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") v.add(d.slice(0, 4) + d.slice(5));
  if (d.startsWith("55") && d.length === 12) v.add(d.slice(0, 4) + "9" + d.slice(4));
  return [...v];
}

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
