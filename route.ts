import { NextRequest, NextResponse } from "next/server";
import { usuarioAtual } from "../../../lib/auth";
import { buscarCotacoes } from "../../../lib/consultas";
import { STATUS_LABEL, fmtData } from "../../../lib/formato";

export const dynamic = "force-dynamic";

// CSV no padrão do Excel brasileiro: separador ";" e vírgula decimal
const num = (n: number | null, casas = 2) =>
  n === null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4, useGrouping: false });
const cel = (v: unknown) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  const p = Object.fromEntries(req.nextUrl.searchParams.entries());
  const lista = await buscarCotacoes(u, p, 100000);

  const cab = [
    "Nº", "Data", "Vendedor", "Cliente", "Produto", "Quantidade (kg)", "Frete", "Pagamento", "Observações",
    "Status", "Preço R$/kg", "Total R$", "Validade", "Obs. do preço", "Motivo da perda", "Respondida em", "Encerrada em", "Origem",
  ];
  const linhas = lista.map((c) =>
    [
      c.id, fmtData(c.criado_em), c.vendedor_nome, c.cliente, c.produto, num(c.quantidade_kg, 0), c.frete,
      c.condicao_pagamento, c.observacoes, STATUS_LABEL[c.status], num(c.preco_kg),
      c.preco_kg !== null ? num(c.preco_kg * c.quantidade_kg) : "", c.validade, c.resposta_obs, c.motivo_perda,
      c.respondida_em ? fmtData(c.respondida_em) : "", c.encerrada_em ? fmtData(c.encerrada_em) : "", c.origem,
    ].map(cel).join(";"),
  );
  const csv = "﻿" + [cab.join(";"), ...linhas].join("\r\n");
  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cotacoes-${hoje}.csv"`,
    },
  });
}
