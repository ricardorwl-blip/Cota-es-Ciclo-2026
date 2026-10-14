import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { processarMensagem } from "../../../lib/bot";
import { marcarComoLida } from "../../../lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Verificação do webhook (feita uma vez pela Meta ao configurar)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Token de verificação inválido", { status: 403 });
}

function assinaturaValida(corpo: string, assinatura: string | null): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo) return true;
  if (!assinatura) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function textoDe(msg: any): string | null {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? null;
    case "button":
      return msg.button?.text ?? null;
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Assinatura inválida", { status: 401 });
  }

  try {
    const json = JSON.parse(corpo);
    for (const entry of json.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          const texto = textoDe(msg);
          await marcarComoLida(msg.id);
          await processarMensagem({
            de: msg.from,
            texto: texto ?? "menu",
            waMsgId: msg.id,
            respostaA: msg.context?.id,
          });
        }
      }
    }
  } catch (err) {
    console.error("[webhook] erro ao processar", err);
  }
  // Sempre 200 para a Meta não ficar reenviando
  return NextResponse.json({ ok: true });
}
