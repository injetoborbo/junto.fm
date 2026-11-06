<div align="center">

# 🎧 Junto.fm

### Música, vídeo e pessoas no mesmo lugar.

**Uma plataforma web de entretenimento social em tempo real.**

[**🌐 Acessar a plataforma**](https://junto-fm.onrender.com) · [**📖 Conhecer o projeto**](#sobre-o-projeto) · [**🧩 Tecnologias**](#tecnologias) · [**🚀 Executar localmente**](#executar-localmente)

</div>

---

## Sobre o projeto

A **Junto.fm** nasceu da ideia de aproximar pessoas que estão longe umas das outras por meio de experiências compartilhadas. Em uma única sala virtual, os participantes podem conversar, ouvir áudio transmitido por um usuário autorizado e acompanhar experiências audiovisuais em conjunto.

A proposta é simplificar algo que normalmente exige vários aplicativos: reunir **mídia, conversa e interação social** no mesmo ambiente, acessível pelo navegador.

> **Situação do projeto:** aplicação experimental em evolução, com funcionalidades dependentes das permissões do navegador, da rede e da configuração dos serviços externos. O funcionamento deve ser validado em testes reais.

## Funcionalidades

| Área | O que oferece |
| --- | --- |
| 🎵 **Salas de áudio** | Criação e acesso a salas para experiências musicais compartilhadas. |
| 💬 **Chat em tempo real** | Mensagens e interações entre participantes conectados. |
| 📺 **Junto.TV** | Recursos de vídeo compartilhado, sincronização do YouTube e compartilhamento de tela, sujeitos às limitações técnicas de cada modo. |
| 🐒 **The Símios** | Ambiente social interativo com avatares 3D, personalização e animações. |
| 👥 **Contas e social** | Recursos de identidade, amizades e interação entre usuários. |
| 🛡️ **Administração de salas** | Controles e permissões para organização e moderação das sessões. |
| 🏆 **Conquistas** | Recursos de conquistas e acompanhamento de atividade. |

As funcionalidades evoluem ao longo do desenvolvimento. A presença de um recurso no código não garante que ele esteja disponível em todos os dispositivos ou configurações.

## Problema e público-alvo

**Problema:** amigos e comunidades que desejam ouvir música, assistir a vídeos e conversar à distância frequentemente precisam alternar entre várias ferramentas, o que pode dificultar a organização da experiência.

**Solução proposta:** um ambiente web único, com salas virtuais e comunicação em tempo real, para tornar essas experiências mais integradas.

**Público-alvo:** grupos de amigos, comunidades online e pessoas que procuram espaços digitais de convivência.

## Tecnologias

- **Front-end:** HTML, CSS e JavaScript.
- **Servidor:** Node.js e Express.
- **Comunicação em tempo real:** Socket.IO.
- **Áudio e vídeo:** APIs de mídia do navegador e WebRTC, conforme o recurso.
- **Persistência:** PostgreSQL via pacote `pg`.
- **Integrações:** recursos associados a Spotify, YouTube e LiveKit, conforme a configuração e a implementação.
- **Hospedagem:** configuração de implantação para **Render** em [`render.yaml`](render.yaml).

### Visão simplificada da arquitetura

```text
           Participantes (navegador)
                     │
           Interface web (HTML/CSS/JS)
                     │
                HTTPS / WSS
                     │
           Node.js + Express
                     │
          ┌──────────┴──────────┐
          │                     │
       Socket.IO           PostgreSQL
    Eventos de salas       Dados persistidos
       e controles         quando aplicável

   Mídia: WebRTC / APIs do navegador /
   integrações externas, conforme o recurso.
```

A arquitetura acima é uma visão geral, não um diagrama de todas as conexões e serviços utilizados pela aplicação.

## Executar localmente

**Requisitos:** Node.js e npm instalados.

```bash
git clone https://github.com/injetoborbo/junto.fm.git
cd junto.fm
npm install
npm start
```

Acesse **http://localhost:3000** no navegador. O HTML não deve ser aberto diretamente como arquivo local, porque o projeto depende do servidor Node.js.

Para recursos que exigem credenciais, use [`.env.example`](.env.example) como referência e configure suas próprias variáveis de ambiente. **Não publique segredos ou arquivos `.env`.** Alguns recursos exigem serviços externos e HTTPS.

### Exemplo: compartilhar áudio de uma aba

1. Acesse a Junto.fm em um navegador compatível e entre em uma sala.
2. Abra uma aba com a fonte de áudio autorizada.
3. Inicie o compartilhamento de áudio da aba e conceda as permissões solicitadas pelo navegador.
4. Os demais participantes entram na mesma sala e habilitam a reprodução, quando necessário.

A qualidade e a disponibilidade da transmissão dependem de permissões, conectividade, compatibilidade do navegador e configuração de WebRTC/STUN/TURN.

## Documentação e testes

O repositório contém documentos de configuração e registros técnicos que ajudam a entender a evolução da aplicação:

- [Testes e limitações da Junto.TV](JUNTO_TV_TESTING.md)
- [Configuração do LiveKit](LIVEKIT_TV_SETUP.md)
- [Testes do ambiente de avatares](DANCE_FLOOR_TESTING.md)
- [Otimização de tráfego na hospedagem](RENDER_BANDWIDTH.md)
- [Configuração de contas Google](GOOGLE_ACCOUNTS_SETUP.md)

Há também testes automatizados na pasta [`tests/`](tests). **Testes de código não substituem validações manuais com dispositivos e redes diferentes.**

## Contexto acadêmico

A Junto.fm é um **projeto pessoal desenvolvido individualmente**, apresentado como **candidato à categoria “Projeto Profissional”** da atividade acadêmica de pós-aula.

O objetivo é demonstrar a aplicação de conceitos de desenvolvimento web, arquitetura, comunicação em tempo real, persistência de dados, segurança, testes e implantação em nuvem.

**Enquadramento e participação em grupo ainda dependem de validação do professor.** Caso o projeto seja aceito para a atividade, as melhorias acadêmicas e as contribuições efetivas serão documentadas separadamente.

O desenvolvimento contou com **apoio significativo de ferramentas de inteligência artificial**, sob direção, integração, testes e revisão do autor. O uso de IA não substitui a necessidade de compreender e explicar as decisões técnicas.

### Próximos passos propostos

- Aprimorar acessibilidade e experiência em dispositivos móveis.
- Melhorar diagnósticos de conexão e mensagens de erro.
- Fortalecer testes automatizados e registrar testes reais.
- Avaliar recursos de histórico de sessões, estatísticas de uso e feedback.

Esses itens são **propostas de evolução**, não funcionalidades anunciadas como concluídas.

## Limitações e responsabilidade

- Algumas redes podem impedir conexões WebRTC diretas.
- Compartilhamento de tela, áudio e reprodução automática dependem do navegador.
- Serviços de terceiros podem exigir credenciais, limitar funcionalidades ou mudar suas regras.
- A aplicação não fornece direitos de retransmissão de músicas, filmes ou outros conteúdos protegidos: os usuários devem respeitar licenças e termos dos serviços.
- O sistema é experimental e pode apresentar instabilidades.

---

<div align="center">

**Junto.fm — experiências ficam melhores quando são compartilhadas.**

[🌐 Abrir Junto.fm](https://junto-fm.onrender.com) · [⬆️ Voltar ao início](#-juntofm)

</div>
