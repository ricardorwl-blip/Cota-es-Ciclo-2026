import { q } from "./db";
import { Usuario, Cotacao } from "./servico";

export type Filtros = { status?: string; vendedor?: string; busca?: string; de?: string; ate?: string };

export function montarFiltro(u: Usuario, f: Filtros) {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (u.papel !== "ADMIN") add("c.vendedor_id = ?", u.id);
  else if (f.vendedor) add("c.vendedor_id = ?", Number(f.vendedor));
  if (f.status) add("c.status = ?", f.status);
  if (f.busca) {
    const n = Number(f.busca.replace("#", ""));
    if (Number.isInteger(n) && n > 0) add("c.id = ?", n);
    else add("(c.cliente ILIKE ? OR c.produto ILIKE ?)", `%${f.busca}%`);
  }
  if (f.de) add("c.criado_em >= ((?::date)::timestamp AT TIME ZONE 'America/Sao_Paulo')", f.de);
  if (f.ate) add("c.criado_em < ((?::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')", f.ate);
  return { where: conds.length ? "WHERE " + conds.join(" AND ") : "", params };
}

export async function buscarCotacoes(u: Usuario, f: Filtros, limite = 300): Promise<Cotacao[]> {
  const { where, params } = montarFiltro(u, f);
  return q<Cotacao>(
    `SELECT c.*, us.nome AS vendedor_nome FROM cotacoes c JOIN usuarios us ON us.id = c.vendedor_id
     ${where} ORDER BY c.id DESC LIMIT ${Number(limite)}`,
    params,
  );
}

export type Indicadores = {
  total: number;
  aguardando: number;
  respondidas: number;
  fechadas: number;
  perdidas: number;
  kg_fechado: number;
  valor_fechado: number;
  horas_resposta: number | null;
};

export async function indicadores(u: Usuario, f: Filtros): Promise<Indicadores> {
  const { where, params } = montarFiltro(u, { ...f, status: undefined });
  const [r] = await q<Indicadores>(
    `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status='AGUARDANDO_PRECO')::int AS aguardando,
       COUNT(*) FILTER (WHERE status='RESPONDIDA')::int AS respondidas,
       COUNT(*) FILTER (WHERE status='FECHADA')::int AS fechadas,
       COUNT(*) FILTER (WHERE status='PERDIDA')::int AS perdidas,
       COALESCE(SUM(quantidade_kg) FILTER (WHERE status='FECHADA'),0)::float AS kg_fechado,
       COALESCE(SUM(quantidade_kg*preco_kg) FILTER (WHERE status='FECHADA'),0)::float AS valor_fechado,
       (AVG(EXTRACT(EPOCH FROM (respondida_em - criado_em))/3600) FILTER (WHERE respondida_em IS NOT NULL))::float AS horas_resposta
     FROM cotacoes c ${where}`,
    params,
  );
  return r;
}

export type PorVendedor = {
  vendedor_id: number;
  nome: string;
  total: number;
  abertas: number;
  fechadas: number;
  perdidas: number;
  kg_fechado: number;
  valor_fechado: number;
};

export async function porVendedor(u: Usuario, f: Filtros): Promise<PorVendedor[]> {
  const { where, params } = montarFiltro(u, { ...f, status: undefined });
  return q<PorVendedor>(
    `SELECT c.vendedor_id, us.nome, COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE c.status IN ('AGUARDANDO_PRECO','RESPONDIDA'))::int AS abertas,
       COUNT(*) FILTER (WHERE c.status='FECHADA')::int AS fechadas,
       COUNT(*) FILTER (WHERE c.status='PERDIDA')::int AS perdidas,
       COALESCE(SUM(c.quantidade_kg) FILTER (WHERE c.status='FECHADA'),0)::float AS kg_fechado,
       COALESCE(SUM(c.quantidade_kg*c.preco_kg) FILTER (WHERE c.status='FECHADA'),0)::float AS valor_fechado
     FROM cotacoes c JOIN usuarios us ON us.id = c.vendedor_id ${where}
     GROUP BY c.vendedor_id, us.nome ORDER BY valor_fechado DESC, total DESC`,
    params,
  );
}

export async function listarVendedores(): Promise<Usuario[]> {
  return q<Usuario>(`SELECT id, nome, usuario, papel, telefone, wa_id, ativo FROM usuarios ORDER BY ativo DESC, papel, nome`);
}
