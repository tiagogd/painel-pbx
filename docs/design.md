# Painel das Centrais PBX — Documento de Design

_Data: 2026-10-26 · Autor do desenho: Tiago + Claude · Construtor: Claude_

## Intenção e o porquê

Hoje a Nextcomm só descobre que uma central PBX está em apuros quando o
cliente liga reclamando que não consegue ligar ou que está tudo lento. A
investigação é reativa: alguém entra no servidor e olha CPU, memória e disco.

A ideia é inverter isso. Um painel numa TV de parede mostra todas as ~20
centrais de uma vez, atualizando a cada 10s. Bater o olho e já saber qual
central está sufocando — antes da reclamação do cliente.

## Objetivos

- Mostrar as ~20 centrais (Yeastar e 3CX) numa grade de cartões.
- Cada cartão: nome da central, IP, tipo, e CPU / memória / disco.
- Estado por cor: verde (ok), amarelo (alerta), vermelho (crítico), com a
  borda do cartão gritando de longe.
- Atualização automática a cada 10s.
- Legível numa TV de parede, à distância.

## Não-objetivos (por enquanto)

- Sem avisos ativos (Telegram/WhatsApp/e-mail) — o uso é a TV. _(Pode entrar depois.)_
- Sem histórico/gráfico de série temporal — só o estado atual. _(Chute a confirmar; pode entrar depois.)_
- Sem métricas específicas do PBX (troncos, ligações ativas) — CPU/mem/disco
  já apontam a causa na grande maioria dos casos, segundo o Tiago.

## Como coleta

O serviço central busca CPU, memória e disco de cada central a cada 10s. O
**método de coleta é por central, conforme o tipo** — são dois jeitos de obter
os mesmos três números:

- **Yeastar (todos P-Series) → SNMP v3.** Nativo do appliance, só leitura
  (GET), sem shell. CPU/mem/disco pelos OIDs padrão de sistema; os OIDs exatos
  são confirmados num Yeastar real ao plugar o primeiro (varia por modelo).
  Recomendado v3 (auth + criptografia) em vez de v2c, que manda a community em
  texto puro.
- **3CX (Debian) → SSH.** Poll agentless: comandos baratos (`free`, `df`,
  CPU via `/proc/stat` ou `top -bn1`). O 3CX não tem SNMP nativo, e instalar
  `snmpd` seria agente — que a gente quis evitar.

**Nenhum agente instalado dentro das máquinas**, por nenhum dos caminhos.
Acesso hoje é pelo painel do gerenciador de VM (Virtuax ou AWS); SNMP e SSH
serão configurados para a coleta.

## Layout

- **Opção A — grade de cartões** (escolhida). Cada central é um quadrado;
  borda colorida marca o estado. Mockup validado.
- Tema escuro, estilo NOC, sempre ligado.

## Gestão de acesso (completa)

Dois caminhos de entrada bem separados:

- **Link da TV (somente-exibição).** URL com token aleatório que mostra só a
  grade de cartões, sem login e sem nada clicável de configuração. Admin pode
  regenerar o token para revogar um link antigo.
- **Aplicação (login).** Usuários nomeados, com papéis:
  - **admin** — configura centrais, mexe no SSH e gerencia usuários.
  - **visualizador** — vê o painel pelo navegador; não configura nada.
- **Registro de auditoria**: quem mudou o quê e quando (cadastro/edição de
  central, mudança de SSH, gestão de usuários).
- Primeiro admin é semeado na instalação; depois admins criam os demais
  usuários (sem auto-cadastro). Reset de senha é feito por um admin.
- **Login agora: contas locais** (e-mail + senha). A camada de login é
  separada e os usuários são identificados por e-mail, de propósito.
- **Planejado (depois): "Entrar com a Microsoft"** via Entra ID (Azure AD /
  OpenID Connect). Encaixa por cima sem retrabalho: o e-mail do login
  Microsoft casa com o usuário já cadastrado e herda o papel dele. Vai exigir
  registrar um app no Entra (client ID/secret + URL de redirecionamento).
- Credenciais SSH das centrais ficam só no host coletor, com permissão
  restrita; não aparecem na tela depois de cadastradas.

## Decisões de construção (chamadas do construtor)

- **Stack: Node.js.** Um processo coleta (SSH via `ssh2`, SNMP via
  `net-snmp`) e serve a página; o front é o layout da Opção A consumindo um
  JSON a cada 10s. Coletor com interface única e duas implementações.
- **Armazenamento: SQLite** (arquivo único no host) para usuários, papéis,
  configuração das centrais, tokens de TV e log de auditoria. Sem servidor de
  banco separado.
- Senhas guardadas com hash forte (bcrypt/argon2); sessão por cookie.
- Limiares (chute a confirmar na prática): amarelo ≥ 80%, vermelho ≥ 90%.

## Em aberto (resolver no começo da construção)

1. **Host coletor**: uma VM que enxergue (rede/SSH) todas as ~20 centrais e
   que o navegador da TV consiga acessar. Onde roda — AWS ou Virtuax?
2. **Credenciais de coleta**: Yeastar — usuário/credencial SNMP v3 (auth +
   priv) em cada appliance. 3CX — usuário SSH dedicado e somente-leitura, com
   chave. Tudo guardado só no host coletor.
3. **Alcance de rede**: todas as 20 são acessíveis a partir de um único host
   (SNMP/UDP 161 nos Yeastar, SSH nos 3CX) — IP público + firewall, VPN?

## Combinado de trabalho

Claude constrói; Tiago passa acessos e dados conforme a construção pedir.
Ajustes acontecem durante a construção.
