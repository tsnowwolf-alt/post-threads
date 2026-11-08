# Painel de Publicações

App para organizar publicações de várias contas do Threads em **levas** agendadas por data.
Funciona como um aplicativo no celular: instala pelo Chrome, abre sem internet e guarda tudo
no próprio aparelho.

**Autoria de Gabriel Marangoni**

## Publicar o app (uma vez só, grátis, pelo GitHub Pages)

1. Entre em [github.com](https://github.com) e crie uma conta, se ainda não tiver.
2. Crie um repositório novo (**New repository**), público, com o nome `painel-publicacoes`.
3. No repositório, toque em **Add file → Upload files** e envie todos os arquivos desta pasta:
   `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, os três ícones `.png` e este `README.md`.
   Depois toque em **Commit changes**.
4. Vá em **Settings → Pages**. Em **Branch**, escolha `main` e `/ (root)` e toque em **Save**.
5. Em um ou dois minutos o endereço aparece no topo dessa página, algo como
   `https://SEU-USUARIO.github.io/painel-publicacoes/`. É esse link que você manda para as pessoas.

## Como cada pessoa instala

1. Abre o link no **Chrome** do celular.
2. Toca em **Instalar app** (aparece no próprio painel ou no menu ⋮ do Chrome).
3. Pronto: o ícone fica na tela inicial e o app abre mesmo sem internet.

## Onde ficam os dados

Contas, levas, textos, fotos e vídeos ficam guardados **só no celular de cada pessoa**, dentro do app.
O código fica público no GitHub, mas os dados de ninguém passam por lá.

Por isso, use **⚙️ → Baixar backup** de vez em quando. O arquivo `.zip` guarda tudo, com as fotos e
os vídeos organizados em pastas por data, leva e @conta, e serve para restaurar no mesmo celular ou
em outro (**⚙️ → Restaurar backup**).

Atenção: limpar os dados do Chrome ou desinstalar o app apaga as publicações guardadas nele.

## Publicar uma versão nova

Envie os arquivos alterados para o mesmo repositório e, no `sw.js`, aumente a versão
(`painel-v1` → `painel-v2`). Quem já instalou recebe a atualização sozinho: ela entra na
abertura seguinte do app com internet.
