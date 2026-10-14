# Cotações Ciclo — guia de implantação e uso

Sistema de cotações para os vendedores da Ciclo. O vendedor pede a cotação conversando com o número de WhatsApp da Ciclo, você responde o preço pelo próprio WhatsApp (ou pelo painel) e tudo fica registrado com histórico. O painel web tem login individual: cada vendedor vê só as próprias cotações e o administrador vê todas.

---

## Como funciona no dia a dia

**Vendedor (pelo WhatsApp)**
1. Manda **1** (ou "nova") para o número de cotações.
2. O bot pergunta, em sequência: cliente, produto, quantidade (kg ou "25 t"), frete CIF/FOB, condição de pagamento e observações.
3. Confirma com **1**. Você recebe a cotação no seu WhatsApp na hora.
4. Quando você responder o preço, o vendedor recebe preço/kg, total estimado e validade.
5. Depois do retorno do cliente ele envia **fechou 12** ou **perdeu 12 preço alto**.

**Você (administrador)**
- Para precificar, **responda (citando) a mensagem da cotação só com o preço**, ex.: `9,85 válido até sexta`.
- Ou envie `preco 12 9,85 observação`. Para revisar um preço, é só mandar de novo.
- `pendentes` lista o que está aguardando preço.

**Comandos do WhatsApp**

| Mensagem | O que faz |
|---|---|
| `menu` ou `oi` | Mostra as opções |
| `1` / `nova` | Abre nova cotação (passo a passo) |
| `2` / `minhas` | Últimas 10 cotações |
| `3` / `abertas` | Cotações em aberto |
| `ver 12` | Detalhes da cotação 12 |
| `fechou 12` | Marca como pedido fechado |
| `perdeu 12 motivo` | Marca como perdida (se faltar o motivo, o bot pergunta) |
| `cancelar 12` | Cancela a cotação |
| `cancelar` | Sai do passo a passo |
| `preco 12 9,85 obs` | **Admin**: informa/revisa o preço |
| `pendentes` | **Admin**: cotações aguardando preço |

**Painel web**
- **Cotações**: indicadores (aguardando, fechadas, perdidas, conversão, volume e valor fechados), filtros por status, vendedor, período e busca, quadro por vendedor (admin) e botão **Exportar Excel**.
- **Detalhe da cotação**: dados, preço, ações (responder, fechar, perder, cancelar) e **histórico completo**, com cada mudança e cada mensagem de WhatsApp trocada.
- **Vendedores** (só admin): cadastrar, trocar senha, telefone, perfil e desativar acesso.

---

## Implantação — passo a passo

### 0. Publicar na Vercel, sem terminal (~10 min)
1. Descompacte o arquivo `cotacoes-ciclo.zip`.
2. Em **github.com** (crie uma conta grátis se não tiver): botão **New** → nome `cotacoes-ciclo` → marque **Private** → **Create repository**.
3. Na página do repositório vazio, clique em **uploading an existing file**. Arraste **o conteúdo** da pasta descompactada (as pastas `app`, `lib`, `scripts` e os arquivos soltos, não a pasta-mãe) → **Commit changes**.
   - Se o arquivo `.gitignore` ou `.env.example` não aparecer (arquivos que começam com ponto ficam ocultos no Windows), não tem problema: o sistema funciona sem eles.
4. Em **vercel.com** → **Add New… → Project** → **Import Git Repository** → conecte o GitHub → escolha `cotacoes-ciclo` → **Import**.
5. Antes de clicar em Deploy, abra **Environment Variables** e adicione:

| Nome | Valor |
|---|---|
| `SESSION_SECRET` | `Zgx-wRMzfrmXZB4tuvsvnd2Tpv7g7My5LW8wMe7CSdM` |
| `WHATSAPP_VERIFY_TOKEN` | `ciclo-a16bb9ff2ff0229703` |
| `WHATSAPP_TEMPLATE` | `aviso_cotacao` |

6. Clique em **Deploy**. Em ~1 minuto o site fica no ar em `https://cotacoes-ciclo-xxxx.vercel.app`. Ele ainda não abre até o banco ser conectado (passo 1).

Daqui em diante, toda alteração enviada ao GitHub é publicada automaticamente.

### 1. Banco de dados (Vercel, ~3 min)
1. Abra o projeto **cotacoes-ciclo** em vercel.com.
2. Aba **Storage** → **Create Database** → escolha **Neon (Postgres)** → plano gratuito → região **São Paulo (gru1)** se houver, senão a mais próxima.
3. Clique em **Connect** para ligar ao projeto (isso cria a variável `DATABASE_URL`).
4. Aba **Deployments** → nos três pontinhos do último deploy → **Redeploy**.

As tabelas são criadas sozinhas no primeiro acesso.

### 2. Primeiro acesso
1. Abra o endereço do site. Ele vai para a tela **Primeiro acesso**.
2. Crie seu usuário administrador e **informe seu WhatsApp pessoal**. É nele que você vai receber as cotações para precificar.
3. Em **Vendedores**, cadastre cada vendedor com nome, login, senha e **WhatsApp**.

### 3. WhatsApp oficial (Meta) — ~1 hora + aprovação da Meta
Você precisa de um **número dedicado** para o bot (um chip novo ou um fixo da empresa). Esse número **não pode estar em uso no WhatsApp comum**.

1. **Conta Meta Business**: em business.facebook.com, crie ou entre na conta da Ciclo e inicie a **verificação da empresa** (CNPJ e comprovante). Sem ela, a Meta limita o volume de mensagens.
2. **App**: em developers.facebook.com → **Meus apps** → **Criar app** → tipo **Empresa** → vincule à conta da Ciclo → adicione o produto **WhatsApp**.
3. **Número**: em **WhatsApp → Configuração da API** → **Adicionar número de telefone** → valide por SMS ou ligação. Copie a **Identificação do número de telefone** (Phone number ID).
4. **Token permanente**: em business.facebook.com → **Configurações** → **Usuários do sistema** → **Adicionar** (perfil Admin) → **Atribuir ativos** (o app, com controle total) → **Gerar token** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, validade **Nunca**. Copie o token.
5. **Chave secreta do app**: no app → **Configurações do app → Básico** → **Chave secreta do aplicativo** → Mostrar → copie.
6. **Variáveis na Vercel**: projeto → **Settings → Environment Variables**. Adicione:

| Nome | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token do passo 4 |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do passo 3 |
| `WHATSAPP_APP_SECRET` | chave do passo 5 |
| `WHATSAPP_TEMPLATE` | `aviso_cotacao` |

`SESSION_SECRET`, `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_TEMPLATE` já entraram no passo 0. Depois de salvar, faça **Redeploy**.

7. **Webhook**: no app → **WhatsApp → Configuração** → **Webhook** → **Editar**:
   - URL de callback: `https://SEU-ENDERECO.vercel.app/api/whatsapp`
   - Token de verificação: `ciclo-a16bb9ff2ff0229703` (o mesmo de `WHATSAPP_VERIFY_TOKEN`)
   - Clique em **Verificar e salvar**. Depois, em **Campos do webhook**, **assine `messages`**.
8. **Modelo de mensagem**: no WhatsApp Manager → **Modelos de mensagem** → **Criar modelo**:
   - Categoria **Utilidade**, nome `aviso_cotacao`, idioma **Português (BR)**
   - Corpo: `Atualização no sistema de cotações da Ciclo: {{1}}`
   - Envie para aprovação (costuma sair em minutos).

   **Por que é preciso**: a Meta só permite mensagem livre para quem falou com o número nas **últimas 24 horas**. Fora dessa janela, o sistema envia o aviso por esse modelo automaticamente.
9. **Forma de pagamento**: no WhatsApp Manager, cadastre um cartão. A Meta cobra por mensagem de modelo enviada fora da janela de 24h; respostas dentro da janela costumam ser gratuitas. Confira a tabela atual de preços da Meta para o Brasil.

### 4. Ativar os vendedores
Peça para cada vendedor salvar o número do bot e mandar **oi**. No painel, em **Vendedores**, o aviso "ainda não falou com o bot" some quando isso acontece.

---

## Observações técnicas
- Stack: Next.js 15 (App Router) + PostgreSQL (driver `pg`), hospedado na Vercel.
- O bot reconhece números com ou sem o nono dígito, pois o WhatsApp às vezes entrega sem ele.
- Mensagens duplicadas reenviadas pela Meta são ignoradas.
- Um passo a passo parado expira em 60 minutos.
- Teste automatizado do bot: `npm run test:bot` (simula 16 cenários com banco em memória).
