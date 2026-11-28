<div align="center">

# Junto.fm

**Música, vídeo e convivência em tempo real.**

Uma plataforma web para compartilhar experiências de mídia e interação social em salas virtuais.

[**Acessar a aplicação**](https://junto-fm.onrender.com) · [**Vídeo de apresentação**](https://youtu.be/_s0JJDTq91Q)

</div>

---

## Sobre

A Junto.fm reúne recursos de comunicação e entretenimento em um ambiente web. O projeto explora salas virtuais nas quais os participantes podem conversar, compartilhar áudio e vídeo e interagir por meio de avatares e atividades sociais.

A aplicação está em **desenvolvimento contínuo**. A disponibilidade de determinados recursos depende da configuração dos serviços externos, das permissões do navegador e das condições de rede.

## Principais recursos

- **Salas virtuais:** espaços para reunir participantes e compartilhar experiências.
- **Chat em tempo real:** comunicação entre usuários conectados.
- **Junto.TV:** recursos de vídeo compartilhado, sincronização e transmissão de mídia.
- **Avatares 3D:** personalização e animações no ambiente The Símios.
- **Recursos sociais:** contas, amizades e interação entre usuários.
- **Conquistas e atividades:** mecanismos de engajamento dentro da plataforma.

Os recursos podem apresentar diferenças entre navegadores e dispositivos. Consulte a aplicação para verificar a disponibilidade atual.

## Demonstração

[Assistir à apresentação da Junto.fm no YouTube](https://youtu.be/_s0JJDTq91Q)

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | HTML, CSS e JavaScript |
| Servidor | Node.js e Express |
| Comunicação em tempo real | Socket.IO |
| Mídia | APIs do navegador, WebRTC e LiveKit, conforme o recurso |
| Banco de dados | PostgreSQL |
| Integrações | Spotify e YouTube |
| Hospedagem | Render |

### Arquitetura simplificada

```text
Navegador
   │
   ├── Interface web (HTML / CSS / JavaScript)
   │
   └── HTTPS / WebSocket
             │
       Node.js + Express
             │
       ├── Socket.IO
       ├── PostgreSQL
       └── Serviços de mídia e integrações externas
```

Este diagrama apresenta os componentes principais e não representa todos os fluxos internos da aplicação.

## Executar localmente

### Requisitos

- Node.js
- npm
- PostgreSQL para recursos que utilizam persistência
- Credenciais dos serviços externos necessários aos recursos que deseja testar

### Instalação

```bash
git clone https://github.com/injetoborbo/junto.fm.git
cd junto.fm
npm install
npm start
```

A aplicação será iniciada em:

[http://localhost:3000](http://localhost:3000)

### Configuração

1. Copie `.env.example` para um arquivo chamado `.env`.
2. Preencha as variáveis necessárias para os serviços que pretende utilizar.
3. Configure o banco de dados e as credenciais externas quando aplicável.
4. Reinicie o servidor após alterar as variáveis.

**Nunca envie credenciais, tokens ou arquivos `.env` para o repositório.** As variáveis de ambiente de produção devem ser configuradas no painel do serviço de hospedagem.

## Testes

O projeto inclui testes automatizados para recursos de salas, Junto.TV, comunidade e configuração de avatares.

Comandos disponíveis:

```bash
npm run test:tv
npm run test:rooms
npm run test:community
node --test tests/avatar-setup.test.js
```

Os testes automatizados ajudam a validar comportamentos específicos, mas não substituem testes manuais em diferentes navegadores, dispositivos e redes.

## Documentação técnica

- [Configuração de autenticação administrativa](ADMIN-AUTH-SETUP.md)
- [Configuração de contas Google](GOOGLE_ACCOUNTS_SETUP.md)
- [Configuração do LiveKit para Junto.TV](LIVEKIT_TV_SETUP.md)
- [Testes e limitações da Junto.TV](JUNTO_TV_TESTING.md)
- [Testes do ambiente de avatares](DANCE_FLOOR_TESTING.md)
- [Documentação dos quartos](QUARTOS.md)
- [Documentação do mural](MURAL.md)
- [Otimização de tráfego no Render](RENDER_BANDWIDTH.md)

## Implantação

O repositório contém uma configuração de implantação para Render em [`render.yaml`](render.yaml). Recursos que dependem de serviços externos precisam de suas respectivas variáveis de ambiente configuradas no ambiente de produção.

Aplicação hospedada: [junto-fm.onrender.com](https://junto-fm.onrender.com)

## Observações

- A transmissão de áudio e vídeo depende de permissões do navegador, compatibilidade e conectividade.
- Algumas conexões WebRTC podem exigir configuração de STUN/TURN ou serviços de mídia externos.
- Integrações de terceiros estão sujeitas às suas próprias regras, limites e disponibilidade.
- A Junto.fm não concede direitos de retransmissão de músicas, vídeos ou outros conteúdos protegidos. Os usuários são responsáveis por respeitar as licenças e os termos aplicáveis.
- O projeto ainda não possui uma licença de código aberto definida.

---

<div align="center">

**Junto.fm — compartilhar é melhor.**

[Aplicação](https://junto-fm.onrender.com) · [Apresentação](https://youtu.be/_s0JJDTq91Q)

</div>
