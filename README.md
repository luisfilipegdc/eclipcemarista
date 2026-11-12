# Eclipse VR — Missão Satélite

Experiência em realidade virtual para óculos de **celular** (Opus VR / Shinecon — tela dividida)
e também para óculos **WebXR** (Meta Quest), em que o aluno
fica dentro de um **satélite em órbita** e vê de perto um **eclipse solar** e um
**eclipse lunar** acontecendo.

Roda direto no navegador (sem instalar nada): celular no óculos, Quest ou computador.

## Óculos de celular (Opus VR)

Mesma tela dividida do app *Viagem à Lua*:
- celular **deitado**, tela dividida em duas metades (uma para cada olho), com **correção das lentes**;
- **distância entre as lentes** ajustável de 50 a 72 mm (padrão 62 mm), salva no celular;
  durante a missão, botões **Olhos −** e **Olhos +** (aparece uma mira amarela para alinhar);
- **giroscópio** para olhar em volta (sem giroscópio, arrastar o dedo);
- aviso “Deite o celular” quando está em pé; tela cheia e tela sempre acesa;
- para apertar os botões do painel do satélite: **olhar para o botão por 1,5 s** (a mira enche);
- tocar na tela mostra os botões do professor (Olhos −/+, Tela cheia, Centralizar, Eclipse solar,
  Eclipse lunar, Próxima parada, Pausar, Sair).

## O que o aluno vê

**Eclipse solar** (5 paradas)
1. Visão geral: Sol, Lua e Terra se alinhando.
2. A sombra da Lua sobre a Terra (sobre o Brasil): penumbra (eclipse parcial, em amarelo, com
   linhas de 25/50/75% do Sol coberto) e umbra (eclipse total, contorno vermelho).
3. Dentro da umbra: o Sol some atrás da Lua e aparece a coroa solar; a cabine escurece.
4. Volta ao redor da Terra: a sombra ocupa só um pedaço do lado do dia.
5. Por que não há eclipse todo mês (órbita inclinada da Lua).

**Eclipse lunar** (5 paradas)
1. Visão geral: a Terra entre o Sol e a Lua.
2. A Lua entrando na sombra — a borda curva prova que a Terra é redonda.
3. Lua de sangue: a Lua fica vermelha no eclipse total.
4. A Terra vista da Lua, tapando o Sol, com o anel vermelho da atmosfera.
5. Quem consegue ver: toda a metade noturna da Terra (área em verde).

As sombras são calculadas fisicamente (quanto do disco do Sol está coberto em cada ponto),
então umbra, penumbra e a cor da Lua mudam de forma contínua enquanto a Lua anda na órbita.

## Controles

| Onde | Como |
|---|---|
| Celular no óculos | Olhe para um botão do painel por 1,5 s. Toque na tela para os botões do professor. |
| Quest | Aponte o controle para o painel e aperte o **gatilho**. **Joystick**: girar 30°. **A/X**: próxima parada. **B/Y**: pausar. |
| Computador | Arraste o mouse para olhar; clique nos botões. Teclas **1** (solar), **2** (lunar), **Espaço** (pausar), **N** (próxima parada). |

Botões do painel: Eclipse Solar, Eclipse Lunar, Reiniciar, Pausar, Próxima parada,
Velocidade (0,5x a 4x), Cones de sombra, Onde é visível, Nomes, Narração (voz do navegador, se houver).

## Como publicar e abrir no Quest

O WebXR exige **HTTPS**. O jeito mais fácil é o GitHub Pages:

1. No GitHub: *Settings → Pages → Build and deployment → Deploy from a branch*, escolha a branch e a pasta `/ (root)`.
2. Abra o endereço gerado (`https://<usuario>.github.io/eclipcemarista/`) no Chrome/Safari do celular
   e toque em **Com óculos VR** — ou, no Quest, toque em **ENTER VR**.

Para testar no computador:

```bash
python3 -m http.server 8000
```

e abra `http://localhost:8000`.

O app não depende de internet externa: o three.js está em `vendor/` e as texturas em `assets/`.

## Estrutura

- `index.html` — tela inicial e carregamento.
- `src/main.js` — cena, satélite, controles, painel e lógica do passeio.
- `src/tour.js` — roteiro e textos de cada parada (fácil de editar).
- `src/shaders.js` — sombreamento da Terra, atmosfera e Lua (cálculo de umbra/penumbra).
- `src/phonevr.js` — tela dividida, correção das lentes, distância entre lentes e giroscópio.
- `src/panel.js` — painel de controle desenhado em canvas.
- `assets/` — texturas geradas por `tools/gerar_texturas.py` (contornos dos continentes do pacote `global-land-mask`).
- `vendor/` — three.js r169 (licença MIT, em `vendor/THREE_LICENSE`).

## Observação sobre escala

As distâncias foram encurtadas para tudo caber na visão (a Lua real fica a ~30 diâmetros da
Terra). Os tamanhos aparentes do Sol e da Lua foram mantidos parecidos, como na realidade —
é isso que permite o eclipse total com a coroa solar.
