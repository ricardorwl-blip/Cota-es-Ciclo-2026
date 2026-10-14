import { redirect } from "next/navigation";
import { configurarAdmin } from "../acoes";
import { q } from "../../lib/db";

export const dynamic = "force-dynamic";

export default async function Setup({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM usuarios`);
  if (n > 0) redirect("/login");

  return (
    <div className="login-wrap">
      <div className="login">
        <h1>Primeiro acesso</h1>
        <p className="sub" style={{ margin: 0 }}>Crie o usuário administrador. Esta tela só aparece uma vez.</p>
        <form action={configurarAdmin}>
          {erro && <div className="aviso erro">{erro}</div>}
          <label>
            Seu nome
            <input name="nome" required />
          </label>
          <label>
            Usuário (login)
            <input name="usuario" autoCapitalize="none" placeholder="ex: ricardo" required />
          </label>
          <label>
            Senha (mínimo 6)
            <input name="senha" type="password" minLength={6} required />
          </label>
          <label>
            Seu WhatsApp (recebe as cotações para precificar)
            <input name="telefone" placeholder="(11) 98765-4321" inputMode="tel" />
          </label>
          <button className="btn verde" type="submit">Criar administrador</button>
        </form>
      </div>
    </div>
  );
}
