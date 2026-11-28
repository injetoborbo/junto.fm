<div align="center">

# Junto.fm

**Música, vídeo e interação social em salas virtuais.**

Uma plataforma web para compartilhar mídia, conversar e interagir em tempo real.

[Aplicação](https://junto-fm.onrender.com) · [Apresentação](https://youtu.be/_s0JJDTq91Q)

</div>

---

## Visão geral

A Junto.fm é um projeto web de entretenimento social. A plataforma reúne salas virtuais, comunicação em tempo real, compartilhamento de mídia e avatares personalizáveis em uma experiência comunitária.

O projeto está em desenvolvimento contínuo. Recursos que dependem de serviços externos podem exigir configuração adicional e estar sujeitos à disponibilidade desses serviços.

## Recursos

- **Salas virtuais:** ambientes para reunir participantes.
- **Comunicação em tempo real:** chat e interação entre usuários.
- **Junto.TV:** experiência de vídeo compartilhado e sincronização de mídia.
- **Avatares 3D:** personalização, acessórios e animações.
- **Recursos sociais:** contas, amizades, salas pessoais e atividades comunitárias.
- **Temas visuais:** diferentes estilos de interface para personalizar a experiência.

A disponibilidade e o comportamento dos recursos podem variar conforme o navegador, o dispositivo e a configuração do ambiente.

## Tecnologias

| Área | Tecnologias |
| --- | --- |
| Interface | HTML, CSS e JavaScript |
| Servidor | Node.js e Express |
| Comunicação em tempo real | Socket.IO |
| Banco de dados | PostgreSQL |
| Gráficos e avatares 3D | Three.js |
| Áudio e vídeo | WebRTC e LiveKit |
| Integrações | Spotify e fontes de vídeo compatíveis |
| Hospedagem | Render |

### Arquitetura simplificada

```text
Navegador
  ├── Interface web
  ├── Avatares e cenas 3D
  └── HTTPS / WebSocket
          │
    Node.js + Express
          ├── Socket.IO
          ├── PostgreSQL
          └── Serviços de mídia e integrações
```

O diagrama apresenta os principais componentes, sem detalhar todos os fluxos internos.

## Executar localmente

### Requisitos

- Node.js e npm
- PostgreSQL para os recursos que utilizam persistência
- Credenciais dos serviços externos que deseja testar

### Instalação

```bash
git clone https://github.com/injetoborbo/junto.fm.git
cd junto.fm
npm install
npm start
```

Por padrão, a aplicação é iniciada em [http://localhost:3000](http://localhost:3000).

### Variáveis de ambiente

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis necessárias para as integrações que pretende utilizar.
3. Configure o banco de dados e os serviços externos conforme a documentação correspondente.
4. Reinicie o servidor após alterar as configurações.

**Não compartilhe nem envie arquivos `.env`, tokens, chaves de API ou segredos de sessão.** Configure os segredos de produção diretamente no painel do serviço de hospedagem.

## Testes

O repositório contém testes automatizados para funcionalidades de mídia, salas, comunidade e configuração de avatares.

```bash
npm run test:tv
npm run test:rooms
npm run test:community
node --test tests/avatar-setup.test.js
```

Os testes cobrem comportamentos específicos do código. A validação completa também exige testes manuais com serviços externos configurados e em diferentes navegadores e redes.

## Documentação

- [Configuração de autenticação administrativa](ADMIN-AUTH-SETUP.md)
- [Configuração de contas Google](GOOGLE_ACCOUNTS_SETUP.md)
- [Configuração do LiveKit para Junto.TV](LIVEKIT_TV_SETUP.md)
- [Testes e limitações da Junto.TV](JUNTO_TV_TESTING.md)
- [Testes do ambiente de avatares](DANCE_FLOOR_TESTING.md)
- [Documentação dos quartos](QUARTOS.md)
- [Documentação do mural](MURAL.md)
- [Otimização de tráfego no Render](RENDER_BANDWIDTH.md)

## Implantação

A configuração de implantação está definida em [`render.yaml`](render.yaml). Variáveis de ambiente e credenciais de serviços externos devem ser configuradas no ambiente de produção, não no código-fonte.

Aplicação: [junto-fm.onrender.com](https://junto-fm.onrender.com)

## Observações

- Áudio e vídeo dependem de permissões do navegador, compatibilidade e conectividade.
- Algumas conexões WebRTC podem exigir STUN/TURN ou serviços de mídia externos.
- Integrações de terceiros estão sujeitas aos seus termos, limites e disponibilidade.
- O projeto não concede direitos de retransmissão de músicas, vídeos ou outros conteúdos protegidos. Os usuários devem respeitar as licenças e os termos aplicáveis.
- **O repositório ainda não declara uma licença de código aberto.** A reutilização e redistribuição do código não devem ser presumidas como autorizadas.

---

<div align="center">

**Junto.fm — compartilhar é melhor.**

</div>
