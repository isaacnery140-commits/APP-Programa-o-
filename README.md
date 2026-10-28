# Programador Raynen

App para gerar programas de máquinas retilíneas **Feng Fan / sistema Raynen** a partir de uma descrição em português.
Gera o par **BMP + OPT** (e, no jacquard compacto, também **INA + JQD**) que o Raynen abre em *Abrir → tipo BMP*.

## O que o app faz

- Início e ribana 1x2 tirados do programa **25009F** (compilado no Raynen).
- Corpo em meia malha, malha trás, links quadriculado ou **ponto personalizado** (rapport editável, até 4 guia-fios).
- **Biblioteca de pontos**: 3 pontos extraídos dos programas da fábrica (25009F, 3Q, 37X) e 12 padrões montados pelos códigos do manual (ainda não compilados).
- **Tranças** de 1+1 a 7+7 (códigos 28/29 e 48/49), só quando o programador adiciona.
- **Jacquard** de 2 a 4 cores:
  - **Módulo 120/121** (padrão, 2 cores), igual ao programa **45018FG**: definição do módulo (identificação 102, 4 páginas de 2 passadas) acima da linha de fim;
  - **Compacto**: camada INA com o guia-fio de cada ponto + função 216 (colunas 54/55 do .opt);
  - **Expandido**: uma passada por cor no BMP (método do QTJTH22GG).
  - Desenho por IA (SVG convertido em agulhas), importação de imagem (recorta margem, preserva traços finos), gerador de **texto** (fonte bloco 5x7, negrito, serifada) ou pintura na grade.
- Checagens que evitam os avisos que apareceram nos testes (W002 guia-fio, W020/W021 agulha parada mais de 15 carreiras).

## Como usar

Abra o `index.html` no navegador (ou publique com GitHub Pages).
A interpretação por IA só funciona dentro do Claude (artifact "Programador Raynen"); fora dele, preencha os parâmetros à mão.

1. Descreva a peça ou preencha os parâmetros.
2. Confira a prévia (carreira 1 embaixo, como no Raynen).
3. Baixe o .zip, descompacte, e no Raynen use **Abrir → tipo BMP**. Os arquivos do mesmo nome precisam ficar na mesma pasta.
4. Compile e confira a simulação antes de mandar para a máquina.

## Estrutura

- `index.html`: app pronto (gerado).
- `src/gen.js`: gerador (BMP de códigos + OPT de linhas de função).
- `src/page.src.html`: interface.
- `src/build.py`: monta o `index.html` (`python3 src/build.py`).
- `data/template.json`: cabeçalho/paleta e carreiras de início/ribana do 25009F.
- `data/library.json`: biblioteca de pontos.
- `data/jq_example.json`: desenho floral do QTJTH24S (exemplo de jacquard).
- `exemplos/`: programa de teste aprovado no Raynen (meia malha com trança de 4 agulhas).

## Formato (resumo do que foi descoberto)

- BMP de 8 bits, 1024 × 2048; o índice de cada pixel é o código de cor do Raynen (tabela do cap. 15 do manual); carreira 1 = última linha do arquivo.
- OPT de 8 bits, 512 × 2048: linhas de função. Colunas conhecidas: 1 = repetições (201), 3/4 = módulo e página (201), 22–25 densidade (207), 28/29 deslocamento (208), 54/55 = função 216, 59 = guia-fio (217), 62 = sentido, 95 = fim.
