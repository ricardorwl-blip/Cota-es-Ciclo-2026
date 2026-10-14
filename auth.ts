import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { usuarioPorId, Usuario } from "./servico";

export const COOKIE = "cotacoes_sessao";

export function chave() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET não configurada (mínimo 16 caracteres)");
  return new TextEncoder().encode(s);
}

export async function criarSessao(u: Usuario) {
  const token = await new SignJWT({ uid: u.id, papel: u.papel })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(chave());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave());
    const u = await usuarioPorId(Number(payload.uid));
    return u && u.ativo ? u : null;
  } catch {
    return null;
  }
}

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  return u;
}

export async function exigirAdmin(): Promise<Usuario> {
  const u = await exigirUsuario();
  if (u.papel !== "ADMIN") redirect("/cotacoes");
  return u;
}
