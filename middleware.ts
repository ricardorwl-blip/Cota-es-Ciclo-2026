import { NextRequest, NextResponse } from "next/server";

// Proteção leve: sem cookie de sessão vai para o login.
// A validação completa (assinatura e usuário ativo) acontece em cada página.
const PUBLICAS = ["/login", "/setup", "/api/whatsapp"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("cotacoes_sessao")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
