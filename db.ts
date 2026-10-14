import { Pool } from "pg";

type Row = Record<string, any>;
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

const g = globalThis as unknown as {
  __pool?: Pool;
  __testQuery?: QueryFn;
  __schemaPronto?: Promise<void>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'VENDEDOR',
  telefone TEXT UNIQUE,
  wa_id TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cotacoes (
  id SERIAL PRIMARY KEY,
  vendedor_id INTEGER NOT NULL REFERENCES usuarios(id),
  cliente TEXT NOT NULL,
  produto TEXT NOT NULL,
  quantidade_kg DOUBLE PRECISION NOT NULL,
  frete TEXT NOT NULL,
  condicao_pagamento TEXT NOT NULL,
  observacoes TEXT,
  origem TEXT NOT NULL DEFAULT 'WHATSAPP',
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_PRECO',
  preco_kg DOUBLE PRECISION,
  validade TEXT,
  resposta_obs TEXT,
  motivo_perda TEXT,
  respondida_em TIMESTAMPTZ,
  encerrada_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cot_vendedor ON cotacoes(vendedor_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cot_status ON cotacoes(status);
CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  cotacao_id INTEGER NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  autor_id INTEGER REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evt_cot ON eventos(cotacao_id, criado_em);
CREATE TABLE IF NOT EXISTS mensagens (
  id SERIAL PRIMARY KEY,
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL,
  texto TEXT NOT NULL,
  wa_msg_id TEXT UNIQUE,
  usuario_id INTEGER REFERENCES usuarios(id),
  cotacao_id INTEGER REFERENCES cotacoes(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_cot ON mensagens(cotacao_id, criado_em);
CREATE TABLE IF NOT EXISTS sessoes_bot (
  telefone TEXT PRIMARY KEY,
  etapa TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    g.__pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
  }
  return g.__pool;
}

async function bruto(sql: string, params: unknown[] = []) {
  if (g.__testQuery) return g.__testQuery(sql, params);
  return pool().query(sql, params as any[]);
}

async function garantirSchema() {
  if (!g.__schemaPronto) {
    g.__schemaPronto = (async () => {
      for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
        await bruto(stmt);
      }
    })().catch((e) => {
      g.__schemaPronto = undefined;
      throw e;
    });
  }
  return g.__schemaPronto;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  await garantirSchema();
  const r = await bruto(sql, params);
  return r.rows as T[];
}

export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
