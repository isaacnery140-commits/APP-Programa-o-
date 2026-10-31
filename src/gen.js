// Gerador Raynen (BMP de codigos + .opt de linhas de funcao), regras validadas no 25009F.
// spec = { nome, largura, carreiras, ribanaRep, guiaFio, ponto:{tipo:'meia'|'links'|'quadriculado', bx, by},
//          trancas:[{agulha, grupo, intervalo, primeiro, lateral, sentido:'esq'|'dir'}] }
const RAYNEN = (function () {
  const OFF = 1078, WB = 1024, WO = 512, H = 2048, X0 = 1, START = 25;
  const COL_LOOP = 1, COL_YARN = 59, COL_END = 95, COL_216 = 54;
  function b64(s) {
    if (typeof atob === 'function') { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  let T = null;
  function load(t) {
    T = { bmpHeader: b64(t.bmpHeader), optHeader: b64(t.optHeader), start: b64(t.startRows), startW: t.startW, opt: b64(t.optRows), palette: t.palette };
  }
  // posicao de origem no inicio/ribana do 25009F (padroes com periodo <= 4); larguras > 575 repetem o padrao
  // tipos de barra (ribana): codigo por agulha nas carreiras 16-24; '2x2' = original do 25009F
  const BARRAS = { '2x2': null, '1x1': [1, 2], '2x1': [1, 1, 2], '3x1': [1, 1, 1, 2], '3x3': [1, 1, 1, 2, 2, 2] };
  function srcX(x) { return x <= 575 ? x : x - 4 * Math.ceil((x - 575) / 4); }

  // codigos aceitos num ponto personalizado (tabela do manual, cap. 15)
  const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const MOTIF_CODES = [...R(0, 14), 16, ...R(20, 27), ...R(30, 37), ...R(40, 47), ...R(50, 57), ...R(60, 99), 100, 110, 28, 29, 38, 39, 48, 49, 58, 59, ...R(101, 119), ...R(184, 198), ...R(220, 239), 244, 245, 246, 247, 248]
    .filter((v, i, arr) => arr.indexOf(v) === i).sort((x, y) => x - y);
  const TESTED = new Set([1, 2, 5, 28, 29, 8, 9, 10, 100, 110]);
  const KNITS = new Set([1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, ...R(20, 27), ...R(30, 37), ...R(40, 47), ...R(50, 57), ...R(60, 99), 28, 29, 38, 48, 49, 58, ...R(101, 109), ...R(111, 119), ...R(191, 198), 222, 223, 226, 227, ...R(228, 239), 246, 247]);
  const NOCONN = new Set([8, 9, 10]);
  function motifIssues(m) {
    const out = [];
    const h = m.length, w = m[0].length;
    for (let c = 0; c < w; c++) {           // agulha sem tecer por muitas carreiras (avisos W020/W021 do Raynen)
      let run = 0, best = 0;
      for (let k = 0; k < 2 * h; k++) { const v = m[k % h][c]; if (KNITS.has(v)) run = 0; else { run++; best = Math.max(best, run); } }
      if (best > 15 && best < 2 * h) out.push(`coluna ${c + 1} do rapport fica ${best} carreiras sem tecer (o Raynen avisa acima de 15)`);
      else if (best >= 2 * h && m.some(r => r[c] !== 0)) out.push(`coluna ${c + 1} do rapport nunca tece`);
    }
    return out;
  }
  function normalize(s) {
    const n = Object.assign({ nome: 'NOVO', largura: 50, carreiras: 60, ribanaRep: 12, barra: '2x2', guiaFio: 3, fios: [5, 4, 6], ponto: { tipo: 'meia' }, trancas: [] }, s || {});
    n.ponto = Object.assign({ tipo: 'meia', bx: 5, by: 5 }, n.ponto || {});
    if (!Array.isArray(n.fios)) n.fios = [5, 4, 6];
    n.trancas = (n.trancas || []).map(t => {
      const tr = Object.assign({ grupo: 2, intervalo: 6, lateral: 2, sentido: 'esq' }, t);
      if (tr.primeiro == null) tr.primeiro = tr.intervalo - 1;
      return tr;
    });
    const f = n.forma || {};
    n.forma = {
      cava: Object.assign({ ativo: false, inicio: 60, passos: '2-1-6', borda: 2 }, f.cava || {}),
      decote: Object.assign({ ativo: false, tipo: 'V', inicio: 80, meio: 0, passos: '2-1-10', borda: 2, carcela: 9, calt: 60, colar: 0 }, f.decote || {}),
      aumento: Object.assign({ ativo: false, inicio: 20, passos: '6-1-5', borda: 2 }, f.aumento || {}),
      aumento2: Object.assign({ ativo: false, depois: 4, passos: '2-1-4', borda: 2, onde: 'externa' }, f.aumento2 || {}),
      cintura: Object.assign({ ativo: false, inicio: 30, dim: '6-1-6', retas: 10, aum: '6-1-6', borda: 2, modo: '16' }, f.cintura || {}),
      parcial: Object.assign({ ativo: false, carreiras: 12 }, f.parcial || {}),
      bandoff: Object.assign({ ativo: false }, f.bandoff || {})
    };
    n.nome = String(n.nome || 'NOVO').replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 40) || 'NOVO';
    return n;
  }
  const yarnOf = (s, idx) => idx <= 1 ? s.guiaFio : (s.fios[idx - 2] || s.guiaFio);
  // sistemas no corpo: 1 a 3 guia-fios tecendo o corpo, alternando carreira a carreira (25009F: 4 e 5)
  function sistemas(s) {
    const p = s.ponto, c = Array.isArray(s.corpo) ? s.corpo.map(x => Math.round(+x)).filter(x => x >= 1 && x <= 16).slice(0, 3) : [];
    if (!c.length || p.tipo === 'jacquard' || p.tipo === 'base') return null;
    if (p.tipo === 'motivo' && Array.isArray(p.fios) && p.fios.some(f => f !== 1)) return null;   // ponto com listras/varios fios usa A/B/C/D
    return c;
  }
  const yarnRow = (s, br, sis) => sis && br.f === 1 ? sis[(br.r != null ? br.r : 0) % sis.length] : yarnOf(s, br.f);
  // carreira onde o decote divide: multipla de 2 x sistemas (cada guia-fio volta ao lado de saida)
  const passoDiv = s => 2 * ((sistemas(s) || [1]).length);
  // com 2 ou 3 sistemas a divisao cai numa carreira em que o 1o sistema fez passadas impares (esta do lado direito) e os outros pares (lado esquerdo),
  // como no 25009F: assim cada lado do decote comeca com o guia-fio ja do seu lado (sem caminho vazio longo, W028)
  // decote redondo com correntinha: divide numa carreira em que TODOS os guia-fios estao do lado esquerdo;
  // o guia-fio do lado direito tece a carreira da divisao inteira (lado esquerdo, correntinha no meio, lado direito) e termina na direita
  const correnteOn = s => { const d = s.forma && s.forma.decote; return !!(d && d.ativo && d.tipo === 'redondo' && d.meioModo !== 'v' && +d.meio > 0 && s.ponto.tipo !== 'jacquard'); };
  const splitRow = (s, inicio) => { const q = passoDiv(s); if (correnteOn(s)) return Math.max(q, q * Math.floor((inicio - 1) / q)); if (q > 2) return Math.max(1, q * Math.floor((inicio - 2) / q) + 1); return q * Math.floor((inicio - 1) / q); };

  // linhas do corpo: [{v:(i)=>codigo, f:indice do guia-fio 1..4}]
  function bodyRows(s, N) {
    const p = s.ponto, rows = [];
    if (p.tipo === 'jacquard') {
      const d = p.desenho, h = d.length, w = d[0].length, n = p.cores, W = s.largura;
      const ox = Math.floor((W - w) / 2);
      const colorAt = (c, i) => {
        if (p.modo === 'centro') { const x = i - ox, y = c; return (x >= 0 && x < w && y < h) ? d[y][x] : (p.fundo || 1); }
        return d[c % h][i % w];
      };
      if (p.metodo === 'modulo') {
        // modulo de jacquard igual ao 45018FG: 120 = cor 1, 121 = cor 2; ourelas de 2 agulhas alternando
        for (let t = 0; t < 2; t++) rows.push({ v: () => 3, f: 1, trans: true });
        for (let c = 0; c < N; c++) rows.push({ v: i => {
            const e1 = c % 2 === 0 ? 121 : 120, e2 = c % 2 === 0 ? 120 : 121;
            if (i === 0 || i === W - 2) return e1;
            if (i === 1 || i === W - 1) return e2;
            return 119 + colorAt(c, i);
          }, f: 1, course: c, mod: true });
        return rows;
      }
      for (let t = 0; t < 2; t++) rows.push({ v: () => 1, f: 1, trans: true });
      if (p.metodo === 'expandido') {
        const cor = (c, i) => (n >= 2 && (i < 6 || i >= W - 6)) ? ((i + c) % 2) + 1 : colorAt(c, i);
        for (let c = 0; c < N; c++) for (let k = 1; k <= n; k++)
          rows.push({ v: i => cor(c, i) === k ? 8 : ((X0 + i) % 2 === 0 ? 9 : 0), f: k, course: c });
      } else {
        // compacto (como o 3Q): BMP = malha frente; camada INA = guia-fio de cada ponto; funcao 216 = cores/avesso
        for (let c = 0; c < N; c++) rows.push({ v: () => 1, ina: i => colorAt(c, i), jq: true, course: c, f: 0 });
      }
      return rows;
    }
    const m = p.tipo === 'motivo' ? p.motivo : null, fm = m && Array.isArray(p.fios) ? p.fios : null;
    // faixas: pontos diferentes empilhados de baixo para cima; o ponto principal fica no resto da peca
    const fx = []; let acc = 0; (Array.isArray(s.faixas) ? s.faixas : []).forEach(f => { const h = Math.max(0, Math.round(+f.carreiras || 0)); if (h && Array.isArray(f.motivo) && f.motivo.length && f.motivo[0].length) { fx.push({ a: acc, b: acc + h, m: f.motivo }); acc += h; } });
    if ((m && m.flat().some(v => NOCONN.has(v))) || fx.some(f => f.m.flat().some(v => NOCONN.has(v)))) for (let t = 0; t < 2; t++) rows.push({ v: () => 1, f: 1, trans: true });
    for (let r = 0; r < N; r++) {
      const fa = fx.find(f => r >= f.a && r < f.b);
      if (fa) { const row = fa.m[(r - fa.a) % fa.m.length]; rows.push({ v: i => row[i % row.length], f: 1, r, faixa: true }); continue; }
      let v;
      if (p.tipo === 'links') v = () => 2;
      else if (p.tipo === 'quadriculado') v = i => ((Math.floor(i / p.bx) + Math.floor(r / p.by)) % 2 === 0) ? 1 : 2;
      else if (m) { const row = m[r % m.length]; v = i => row[i % row.length]; }
      else v = () => 1;
      rows.push({ v, f: fm ? (fm[r % fm.length] || 1) : 1, r });
    }
    return rows;
  }
  function planRows(s) {      // ajusta o numero de carreiras para cada guia-fio fazer passadas pares
    const p = s.ponto; let N = s.carreiras, note = null;
    if (p.tipo === 'jacquard') { if (N % 2) { N++; note = `Jacquard com ${s.carreiras} carreiras (ímpar): vou usar ${N} para os guia-fios voltarem ao lado de saída.`; } return { N, note }; }
    const h = p.tipo === 'motivo' && Array.isArray(p.fios) ? p.fios.length : 1;
    const sis = sistemas(s);
    for (let k = 0; k < 4 * Math.max(1, h) * (sis ? sis.length : 1); k++) {
      const cnt = {}; bodyRows(s, N + k).forEach(r => { const y = yarnRow(s, r, sis); cnt[y] = (cnt[y] || 0) + 1; });
      if (Object.values(cnt).every(c => c % 2 === 0)) {
        if (k) note = `Corpo com ${s.carreiras} carreiras: algum guia-fio terminaria do lado errado (W002). Vou usar ${N + k}.`;
        return { N: N + k, note };
      }
    }
    return { N, note: 'Não consegui deixar todos os guia-fios com passadas pares. Confira o aviso W002 ao compilar.' };
  }

  function check(spec) {
    const s = normalize(spec), erros = [], avisos = [];
    const int = v => Number.isInteger(v);
    if (!int(s.largura) || s.largura < 10 || s.largura > 1000) erros.push('Largura deve ser entre 10 e 1000 agulhas.');
    if (!int(s.carreiras) || s.carreiras < 2) erros.push('O corpo precisa de pelo menos 2 carreiras.');
    if (!int(s.ribanaRep) || s.ribanaRep < 1 || s.ribanaRep > 99) erros.push('Repetições da ribana: entre 1 e 99.');
    if (!(s.barra in BARRAS)) erros.push('Tipo de barra desconhecido.');
    if (!int(s.guiaFio) || s.guiaFio < 1 || s.guiaFio > 16) erros.push('Guia-fio entre 1 e 16.');
    s.fios.forEach((f, i) => { if (!int(f) || f < 1 || f > 16) erros.push(`Guia-fio ${'BCD'[i]} entre 1 e 16.`); });
    const p = s.ponto;
    if (p.tipo === 'base') {
      if (!s.base || !s.base.h) erros.push('Escolha no item 4 uma base salva com o programa inteiro para usar o ponto da base.');
      else if (s.base.h <= s.base.rows) erros.push('A base não tem carreiras de corpo acima do corte.');
      if (s.trancas.length) erros.push('Com o ponto da base não dá para adicionar tranças. Remova as tranças.');
      return { spec: s, erros, avisos };
    }
    if (p.tipo === 'quadriculado' && (!(p.bx >= 1) || !(p.by >= 1))) erros.push('Quadriculado: blocos de pelo menos 1 agulha × 1 carreira.');
    if (p.tipo === 'motivo') {
      const m = p.motivo;
      if (!Array.isArray(m) || !m.length || !Array.isArray(m[0]) || !m[0].length) erros.push('Ponto personalizado ainda sem rapport. Escolha um ponto da biblioteca ou clique em "Criar ponto com IA".');
      else if (m.length > 64 || m[0].length > 64 || m.some(r => !Array.isArray(r) || r.length !== m[0].length)) erros.push('Rapport inválido: até 64 × 64 e todas as carreiras com a mesma largura.');
      else {
        const bad = [...new Set(m.flat().filter(v => !MOTIF_CODES.includes(v)))];
        if (bad.length) erros.push(`Rapport usa código(s) fora da lista permitida: ${bad.join(', ')}.`);
        motifIssues(m).forEach(t => avisos.push({ tipo: 'nota', txt: 'Ponto: ' + t + '.' }));
        const untested = [...new Set(m.flat().filter(v => v && !TESTED.has(v)))];
        if (untested.length && !p.real) avisos.push({ tipo: 'nota', txt: `Códigos ainda não compilados nos nossos testes: ${untested.sort((a, b) => a - b).join(', ')}. Confira a simulação.` });
        if (Array.isArray(p.fios) && p.fios.length !== m.length) erros.push('O rapport precisa de um guia-fio para cada carreira.');
      }
    }
    if (p.tipo === 'jacquard') {
      const d = p.desenho;
      if (!(p.cores >= 2 && p.cores <= 4)) erros.push('Jacquard: de 2 a 4 cores.');
      if (!Array.isArray(d) || !d.length || !Array.isArray(d[0]) || !d[0].length) erros.push('Jacquard sem desenho. Crie com IA, importe uma imagem ou desenhe na grade.');
      else if (d.some(r => r.length !== d[0].length)) erros.push('Desenho do jacquard com carreiras de larguras diferentes.');
      else {
        if (d.flat().some(v => v < 1 || v > p.cores)) erros.push(`O desenho usa cores fora de 1–${p.cores}.`);
        if (p.modo === 'centro' && d[0].length > s.largura) erros.push('O desenho é mais largo que a peça.');
        if (p.modo === 'centro' && d.length > s.carreiras) avisos.push({ tipo: 'nota', txt: 'O desenho é mais alto que o corpo: a parte de cima fica de fora.' });
      }
      if (s.trancas.length) erros.push('Tranças e jacquard juntos ainda não são suportados. Remova as tranças.');
      if (p.metodo === 'modulo') {
        if (p.cores !== 2) erros.push('O módulo de jacquard (igual ao 45018FG) é de 2 cores. Para 3 ou 4 cores use o formato compacto (INA).');
        avisos.push({ tipo: 'nota', txt: 'Jacquard em módulo, igual ao 45018FG: desenho com 120 (cor 1) e 121 (cor 2) e a definição do módulo (identificação 102, 4 páginas de 2 passadas) desenhada acima da linha de fim. O Raynen expande ao compilar.' });
      } else if (p.metodo === 'expandido') avisos.push({ tipo: 'nota', txt: 'Jacquard expandido (método QTJTH22GG): uma passada por cor já desenhada no BMP. Difícil de editar no Raynen; prefira o compacto.' });
      else {
        if (!(int(p.avesso) && p.avesso >= 1 && p.avesso <= 26)) erros.push('Tipo de avesso do jacquard (função 216, 2ª coluna): de 1 a 26.');
        avisos.push({ tipo: 'nota', txt: `Jacquard compacto: desenho na camada INA (guia-fio por ponto) e função 216 = ${p.cores} cores, avesso ${p.avesso}. O Raynen expande ao compilar. Confira o tipo de avesso e o grupo de guia-fios no Raynen.` });
      }
    }
    const used = [];
    s.trancas.forEach((t, k) => {
      const nome = `Trança ${k + 1}`;
      if (!(int(t.grupo) && t.grupo >= 1 && t.grupo <= 7)) erros.push(`${nome}: de 1+1 até 7+7 agulhas.`);
      else if (t.grupo > 4) avisos.push({ tipo: 'nota', txt: `${nome}: cruzamento de ${t.grupo} agulhas (deslocamento grande). Confira a densidade e a simulação.` });
      if (!(t.intervalo >= 2)) erros.push(`${nome}: intervalo de cruzamento mínimo de 2 carreiras.`);
      const a = t.agulha - t.lateral, b = t.agulha + 2 * t.grupo - 1 + t.lateral;
      if (a < 1 || b > s.largura) erros.push(`${nome}: não cabe na peça (agulhas ${a}–${b} com as laterais).`);
      used.forEach(([u, v, j]) => { if (a <= v && b >= u) erros.push(`${nome} encosta na Trança ${j + 1}. Afaste as duas.`); });
      used.push([a, b, k]);
      if (t.lateral < 1) avisos.push({ tipo: 'nota', txt: `${nome}: sem malha trás ao lado, a trança fica pouco visível.` });
    });
    checkForma(s, erros, avisos);
    if (!erros.length) {
      const { N, note } = planRows(s);
      if (note) avisos.push({ tipo: 'auto', txt: note });
      const total = (s.base ? s.base.rows : START) + bodyRows(s, N).length + (p.tipo === 'jacquard' && p.metodo === 'modulo' ? 29 : 0);
      if (total > H) erros.push(`Programa longo demais: ${total} carreiras no desenho (máximo ${H}). Diminua o corpo.`);
    }
    if (s.largura % 2 === 0) avisos.push({ tipo: 'nota', txt: 'Largura par: a última agulha cai numa posição de "trás" da ribana. Se o Raynen avisar W021 na última coluna, use largura ímpar.' });
    return { spec: s, erros, avisos };
  }

  // ---- formas: cava (dos dois lados) e decote (V ou redondo) por diminuicao com transferencia ----
  // passos no formato da ficha de processo: "carreiras-agulhas-vezes", ex.: "2-1-6, 4-1-3" (a cada 2 carreiras diminui 1 agulha, 6 vezes)
  function parsePassos(t) {
    const out = [];
    String(t || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).forEach(x => {
      const m = x.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/);
      out.push(m ? { cada: +m[1], ag: +m[2], vezes: +m[3], txt: x } : { erro: x });
    });
    return out;
  }
  const formaAtiva = s => !!(s.forma && (s.forma.cava.ativo || s.forma.decote.ativo || s.forma.aumento.ativo || s.forma.aumento2.ativo || (s.forma.cintura && s.forma.cintura.ativo) || (s.forma.parcial && s.forma.parcial.ativo) || (s.forma.bandoff && s.forma.bandoff.ativo)));
  const evList = x => x && x.ativo ? agenda((+x.inicio || 1) - 1, parsePassos(x.passos).filter(p => !p.erro)) : [];
  const ehPolo = d => !!(d && d.ativo && d.tipo === 'polo');
  // decote polo (25009F): abre uma carcela reta no meio; o decote da gola (passos) so comeca na carreira 'colar'
  const evDec = d => ehPolo(d) ? ((+d.colar || 0) > 0 ? agenda(+d.colar - 1, parsePassos(d.passos).filter(p => !p.erro)) : []) : evList(d);
  const carcelaAg = d => ehPolo(d) ? Math.max(3, Math.min(30, Math.round(+d.carcela || 9))) : 0;
  // aumento depois do decote: comeca 'depois' carreiras apos a ultima diminuicao do decote (ou da cava)
  function inicioAum2(f) {
    let base = 0; [f.decote, f.cava].some(x => { const ev = x === f.decote ? evDec(x) : evList(x); if (ev.length) { base = ev[ev.length - 1][0] + 1; return true; } return false; });
    return base + Math.max(0, +f.aumento2.depois || 0) + 1;
  }
  function eventos(f) {
    const ct = f.cintura || {}, cd = ct.ativo ? agenda((+ct.inicio || 1) - 1, parsePassos(ct.dim).filter(p => !p.erro)) : [];
    const ca = ct.ativo ? agenda((cd.length ? cd[cd.length - 1][0] + 1 : (+ct.inicio || 1) - 1) + Math.max(0, +ct.retas || 0), parsePassos(ct.aum).filter(p => !p.erro)) : [];
    return { cintD: cd, cintA: ca, cava: evList(f.cava), decote: evDec(f.decote), aum: evList(f.aumento),
      aum2: f.aumento2 && f.aumento2.ativo ? agenda(inicioAum2(f) - 1, parsePassos(f.aumento2.passos).filter(p => !p.erro)) : [] };
  }
  // agulhas a mais de cada lado (largura inicial + aumentos = largura maxima)
  function extraLado(f) {
    if (!f) return 0; const e = eventos(f), soma = ev => ev.reduce((a, x) => a + x[1], 0);
    return soma(e.aum) + (f.aumento2 && f.aumento2.onde === 'externa' ? soma(e.aum2) : 0);
  }
  // ultima carreira do corpo (1-base) com diminuicao de cava ou decote; 0 se nao houver
  function fimForma(f) {
    let fim = 0;
    const e = eventos(f); [e.cava, e.decote, e.aum, e.aum2, e.cintD, e.cintA].forEach(ev => { if (ev.length) fim = Math.max(fim, ev[ev.length - 1][0] + 1); });
    if (ehPolo(f.decote)) fim = Math.max(fim, (+f.decote.inicio || 1) + Math.max(2, Math.round(+f.decote.calt || 60)) + 12);   // a carcela tem que caber inteira
    return fim;
  }
  // agenda: lista de [carreira do corpo (0-base), agulhas] a partir de inicio
  function agenda(inicio, passos) {
    const ev = []; let c = inicio;
    passos.forEach(p => { for (let v = 0; v < p.vezes; v++) { ev.push([c, p.ag]); c += p.cada; } });
    return ev;
  }
  // codigo de transferencia: stitch que tece e anda k agulhas (tabela de cores, cap. 15)
  // frente: 6k = vai p/ tras, k a esq., volta p/ frente; 7k = k a dir.   tras: 8k = k a esq.; 9k = k a dir.
  const BACK = new Set([2, 9, 12, 40, 41, 42, 43, 44, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57]);
  function moveCode(v, k, dir) {           // dir -1 esquerda, +1 direita
    if (!v) return 0;
    const back = BACK.has(v);
    return (back ? (dir < 0 ? 80 : 90) : (dir < 0 ? 60 : 70)) + k;
  }
  function checkForma(s, erros, avisos) {
    if (!formaAtiva(s)) return;
    const p = s.ponto, W = s.largura, N = s.carreiras, cv = s.forma.cava, dc = s.forma.decote;
    if (p.tipo === 'jacquard') {
      if (p.metodo !== 'compacto') { erros.push('Cava/decote no jacquard: use o formato Compacto (camada INA). No módulo 120/121 e no expandido as transferências das diminuições não entram na mesma carreira do desenho.'); return; }
      if (dc.ativo && p.cores > 2) { erros.push('Decote no jacquard: até 2 cores. Depois da divisão o lado direito tece com os guia-fios C e D (cor 1 e cor 2), então não sobram guia-fios para 3 ou 4 cores.'); return; }
      if (dc.ativo && (new Set([s.guiaFio, s.fios[0], s.fios[1], s.fios[2]])).size < 4) erros.push('Decote no jacquard: os guia-fios A, B, C e D precisam ser diferentes (A/B no lado esquerdo, C/D no direito).');
      if (dc.ativo) avisos.push({ tipo: 'nota', txt: `Decote no jacquard: lado esquerdo com A/B (${s.guiaFio}/${s.fios[0]}), lado direito com C/D (${s.fios[1]}/${s.fios[2]}) para não passar fio pelo decote. Use no C e no D os mesmos fios/cores do A e do B. Confira os grupos de guia-fio (216, 3ª coluna) no Raynen.` });
    }
    let tot = 0;
    [['Cava', cv], ['Decote', dc]].forEach(([nm, f]) => {
      if (!f.ativo) return;
      const ps = parsePassos(f.passos);
      ps.forEach(x => { if (x.erro) erros.push(`${nm}: passo "${x.erro}" inválido. Use carreiras-agulhas-vezes, ex.: 2-1-6.`); else if (x.ag < 1 || x.ag > 7) erros.push(`${nm}: cada diminuição pode andar de 1 a 7 agulhas (passo ${x.txt}).`); else if (x.cada < 1) erros.push(`${nm}: carreiras do passo ${x.txt} precisam ser 1 ou mais.`); });
      if (!(f.inicio >= 1 && f.inicio < N)) erros.push(`${nm}: começa na carreira ${f.inicio} do corpo, mas o corpo tem ${N} carreiras.`);
      if (!(f.borda >= 1 && f.borda <= 7)) erros.push(`${nm}: borda (agulhas que andam) de 1 a 7.`);
      const ev = nm === 'Decote' && ehPolo(f) ? evDec(f) : agenda(f.inicio - 1, ps.filter(x => !x.erro));
      const fora = ev.filter(e => e[0] >= N); if (fora.length) avisos.push({ tipo: 'nota', txt: `${nm}: ${fora.length} diminuição(ões) passam do fim do corpo e ficam de fora. Aumente as carreiras.` });
      const soma = ev.filter(e => e[0] < N).reduce((a, e) => a + e[1], 0);
      tot += nm === 'Cava' ? 2 * soma : 2 * soma + (f.tipo === 'redondo' && f.meioModo !== 'v' ? +f.meio || 0 : 0) + (ehPolo(f) ? carcelaAg(f) : 0);
    });
    const fa = s.forma.aumento, fb = s.forma.aumento2;
    [['Aumento antes da cava', fa], ['Aumento depois do decote', fb]].forEach(([nm, f]) => {
      if (!f.ativo) return;
      parsePassos(f.passos).forEach(x => { if (x.erro) erros.push(`${nm}: passo "${x.erro}" inválido. Use carreiras-agulhas-vezes, ex.: 6-1-5.`); else if (x.ag < 1 || x.ag > 7) erros.push(`${nm}: cada aumento pode andar de 1 a 7 agulhas (passo ${x.txt}).`); else if (x.cada < 1) erros.push(`${nm}: carreiras do passo ${x.txt} precisam ser 1 ou mais.`); });
      if (!(f.borda >= 1 && f.borda <= 7)) erros.push(`${nm}: borda (agulhas que andam) de 1 a 7.`);
    });
    const ctz = s.forma.cintura;
    if (ctz && ctz.ativo) {
      [['dim', 'diminuição'], ['aum', 'aumento']].forEach(([k, nm]) => parsePassos(ctz[k]).forEach(x => { if (x.erro) erros.push(`Acinturado: passo de ${nm} "${x.erro}" inválido. Use carreiras-agulhas-vezes, ex.: 6-1-6.`); else if (x.ag < 1 || x.ag > 7) erros.push(`Acinturado: cada ${nm} de 1 a 7 agulhas (passo ${x.txt}).`); }));
      if (!(ctz.borda >= 1 && ctz.borda <= 7)) erros.push('Acinturado: borda (agulhas que andam) de 1 a 7.');
    }
    const evs = eventos(s.forma);
    if (ctz && ctz.ativo) {
      const sd = evs.cintD.reduce((a, x) => a + x[1], 0), sa = evs.cintA.reduce((a, x) => a + x[1], 0);
      if (sa > sd) erros.push(`Acinturado: aumenta ${sa} agulhas por lado mas só diminuiu ${sd}. Para alargar além da largura inicial, aumente a largura.`);
      if (2 * sd >= W - 6) erros.push(`Acinturado: diminui ${2 * sd} agulhas numa peça de ${W}. Diminua os passos.`);
      if (cv.ativo && evs.cava.length && evs.cintA.length && evs.cintA[evs.cintA.length - 1][0] >= evs.cava[0][0]) avisos.push({ tipo: 'nota', txt: 'Acinturado: os aumentos passam do começo da cava. Aumente as carreiras antes da cava.' });
      avisos.push({ tipo: 'nota', txt: `Acinturado: diminui ${sd} agulhas de cada lado até a cintura e aumenta ${sa} de volta${ctz.modo === '16' ? ' com a cor 16 (agulha sem ponto entra aos poucos)' : ' com transferência para fora'}.` });
    }
    if (fa.ativo && cv.ativo && evs.aum.length && evs.cava.length && evs.aum[evs.aum.length - 1][0] >= evs.cava[0][0]) avisos.push({ tipo: 'nota', txt: 'Os aumentos passam do começo da cava. Aumente as carreiras retas abaixo da cava ou diminua os aumentos.' });
    if (fb.ativo && !dc.ativo && !cv.ativo) erros.push('Aumento depois do decote: ligue o decote (ou a cava) para saber onde ele começa.');
    if (fb.ativo && fb.onde === 'decote' && !dc.ativo) erros.push('Aumento na borda do decote: ligue o decote.');
    if (fb.ativo && fb.onde === 'decote' && dc.ativo) { const sd = evs.decote.reduce((a, x) => a + x[1], 0), sa = evs.aum2.reduce((a, x) => a + x[1], 0); if (sa > sd + (dc.tipo === 'redondo' ? Math.floor((+dc.meio || 0) / 2) : 0)) erros.push(`Aumento na borda do decote: ${sa} agulhas por lado, mais do que o decote tirou (${sd}). Os dois lados iam se encontrar.`); }
    const ex = extraLado(s.forma); if (W + 2 * ex > 1000) erros.push(`Com os aumentos a peça chega a ${W + 2 * ex} agulhas (máximo 1000).`);
    if (ex) avisos.push({ tipo: 'nota', txt: `Aumentos: a peça começa com ${W} agulhas e chega a ${W + 2 * ex} (${ex} de cada lado). Aumento por transferência para fora, com borda; a agulha que fica vazia faz um furinho decorativo, como no aumento da ficha de processo.` });
    if (tot >= W - 4) erros.push(`Cava e decote somam ${tot} agulhas de diminuição numa peça de ${W}: não sobra largura. Diminua os passos.`);
    if (dc.ativo) {
      if (p.tipo === 'motivo' && Array.isArray(p.fios) && p.fios.some(f => f !== 1)) erros.push('Decote: o ponto usa mais de um guia-fio. Depois da divisão cada lado tece com um guia-fio (A na esquerda, B na direita), então use um ponto de um guia-fio só.');
      { const ss = sistemas(s); if (p.tipo !== 'jacquard' && !(ss && ss.length > 1) && s.fios[0] === (ss ? ss[0] : s.guiaFio)) erros.push('Decote: o lado direito tece com o guia-fio B. Coloque um guia-fio B diferente do guia-fio do corpo.'); }
      if (dc.tipo === 'redondo' && !(dc.meio >= 2 && dc.meio < W / 2)) erros.push('Decote redondo: agulhas do meio entre 2 e metade da largura.');
      if (dc.tipo === 'polo') {
        if (p.tipo === 'jacquard') erros.push('Decote polo (carcela): ainda não funciona no jacquard. Use um ponto de um guia-fio.');
        const cb = +dc.carcela || 0; if (!(cb >= 3 && cb <= 30)) erros.push('Decote polo: a carcela precisa de 3 a 30 agulhas.');
        if (W + cb > 1000) erros.push('Decote polo: a peça mais a carcela passa de 1000 agulhas.');
        if ((+dc.colar || 0) > 0 && +dc.colar <= dc.inicio) erros.push('Decote polo: o decote da gola tem que começar depois do começo da carcela.');
        avisos.push({ tipo: 'nota', txt: `Decote polo (como o 25009F): na carreira ${dc.inicio} a peça divide no meio, as ${cb} agulhas do meio tecem a carcela dos dois lados (esquerda na frente, direita atrás), depois 3 carreiras de transferência com deslocamento de ${cb} agulhas (lado direito vai ${cb} agulhas para a direita) e cada lado segue com a sua carcela em ribana dupla por ${+dc.calt || 0} carreiras.${(+dc.colar || 0) > 0 ? ` O decote da gola começa na carreira ${dc.colar} (${dc.passos}).` : ''} Confira a transferência (linha de deslocamento) na simulação do Raynen.` });
      }
      if (dc.tipo === 'redondo') avisos.push({ tipo: 'nota', txt: dc.meioModo === 'v' ? `Decote redondo com abertura em V: a peça divide no meio sem agulhas paradas; o fundo do decote sai dos passos.` : `Decote redondo: na divisão as ${dc.meio} agulhas do meio fecham com correntinha (band-off): cada agulha tece e passa a malha para a agulha da direita (código 71, uma carreira por agulha), até a 1ª agulha do lado direito. Nenhuma agulha fica presa.` });
      if (p.tipo !== 'jacquard' && dc.tipo !== 'polo') avisos.push({ tipo: 'nota', txt: `Decote: a partir da carreira ${dc.inicio} a peça se divide; o lado esquerdo tece com o guia-fio ${(sistemas(s) || []).length > 1 ? sistemas(s)[1] : (sistemas(s) || [s.guiaFio])[0]} e o direito com o ${(sistemas(s) || []).length > 1 ? sistemas(s)[0] : s.fios[0]}, 2 carreiras de cada lado alternando, igual ao 25009F (cada guia-fio já começa do seu lado).` });
    }
    avisos.push({ tipo: 'nota', txt: 'Formas: as diminuições usam transferência com borda (códigos 61-67/71-77 na frente, 81-87/91-97 atrás). Confira na simulação do Raynen antes de produzir.' });
  }
  // ---- protecao das laterais: as PROT agulhas de cada borda (seguindo a cava/decote, de baixo em cima) so tecem 1/2, sem desenho ----
  let protOff = false;
  const PROT = 6, CABO = new Set([28, 29, 38, 39, 48, 49, 58, 59]);
  function protege(row, a, b, c) {
    if (protOff || a < 0 || b < a || b - a + 1 < 2 * PROT + 2) return;
    let mod = false; for (let i = a; i <= b; i++) if (row[i] >= 120 && row[i] <= 127) { mod = true; break; }
    const faz = i => {
      const v = row[i];
      if (mod) { row[i] = ((i + c) % 2 === 0) ? 121 : 120; return; }
      if (v === 1 || v === 2 || v === 3 || v === 16) return;
      row[i] = v && (BACK.has(v) || PURL.has(v)) ? 2 : 1;
    };
    for (let i = a; i < a + PROT; i++) faz(i);
    for (let i = b; i > b - PROT; i--) faz(i);
    if (!mod) {   // tranca cortada pela protecao: a tranca inteira vira malha frente (cruzamento sem par da erro no Raynen)
      for (let j = a + PROT; j <= b && CABO.has(row[j]); j++) row[j] = 1;
      for (let j = b - PROT; j >= a && CABO.has(row[j]); j--) row[j] = 1;
    }
  }
  function protegeIna(s, bI, W, c, a, b) {   // jacquard compacto: borda alternando cor 1 e cor 2
    if (!bI || b - a + 1 < 2 * PROT + 2) return;
    const y1 = yarnOf(s, 1), y2 = yarnOf(s, 2);
    for (let i = a; i < a + PROT; i++) bI[c * W + i] = (i + c) % 2 === 0 ? y1 : y2;
    for (let i = b; i > b - PROT; i--) bI[c * W + i] = (i + c) % 2 === 0 ? y1 : y2;
  }
  // ---- MODULO BAND-OFF (correntinha): fecha as agulhas de 'de' ate 'ate' (inclusive), uma carreira por agulha ----
  // cada carreira tece 1 agulha e passa a malha para a vizinha no sentido do fechamento (71 = 1 p/ direita, 61 = 1 p/ esquerda);
  // a ultima malha vai para a agulha alem de 'ate', que continua tecendo. Endereco de regulagem #09 (BINDOFF) em todas as carreiras.
  // impar = true: numero impar de carreiras (o guia-fio sai no sentido contrario ao que entrou). Devolve [{g, o}].
  const END_TECE = [24, 35, 39, 43, 47, 115], END_TRANSF = [25, 36, 40, 44, 48, 116], END_BINDOFF = 9;
  // fica = true (fim da peca): a ultima agulha so tece (nao tem vizinha para receber a malha)
  function moduloBindOff(W, base, yarn, de, ate, impar, fica) {
    const passo = ate >= de ? 1 : -1, cod = passo > 0 ? 71 : 61, rows = [], n = Math.abs(ate - de) + 1;
    const linha = (i, v) => { const g = new Uint8Array(W); g[i] = v; const o = base.slice(); o[COL_YARN] = yarn; o[COL_LOOP] = 0; o[32] = 0; o[28] = 0; o[29] = 0;
      END_TECE.forEach(k => { o[k] = END_BINDOFF; }); END_TRANSF.forEach(k => { o[k] = END_BINDOFF; }); rows.push({ g, o }); };
    if ((n % 2 === 1) !== !!impar) linha(de, 1);
    for (let k = 0, i = de; k < n; k++, i += passo) linha(i, fica && k === n - 1 ? 1 : cod);
    return rows;
  }
  // ---- MODULO BAND-OFF COM OS 8 JEITOS DO MANUAL DO RAYNEN (11.5.4 "Handstitch mode", pags. 193-196) ----
  // A = agulha de apoio (comeca o fechamento; tece 8 na carreira de preparo e 10 perto do fim), Z = ultima agulha (so tece no fim).
  // Desenhado da esquerda p/ direita; Z < A espelha (71->61, 31->21, 51->41, 91->81).
  // todas = true (main/waste no fim da peca): soltam todas as agulhas A..Z; senao so as do meio.
  const BO_TIPOS = { s1: 'Single needles (1)', s2: 'Single needles (2)', d1: 'Double needles (1)', d2: 'Double needles (2)', alt: 'Stepped (alternate needle)', main: 'Main yarn doffing', s3: 'Single needles (3)', waste: 'Cast-off with waste yarn' };
  function moduloBindOff8(W, base, yarn, A, Z, tipo, impar, yDesc, todas) {
    const p = Z >= A ? 1 : -1, n = Math.abs(Z - A), pos = k => A + p * k, M = { 71: 61, 31: 21, 51: 41, 91: 81 }, cd = v => p > 0 ? v : (M[v] || v);
    const rows = [], linha = (cel, y) => { const g = new Uint8Array(W); cel.forEach(([i, v]) => { if (i >= 0 && i < W) g[i] = cd(v); }); const o = base.slice(); o[COL_YARN] = y === undefined ? yarn : y; o[COL_LOOP] = 0; o[32] = y === 0 ? 1 : 0; o[28] = 0; o[29] = 0; o[COL_END] = 0;
      END_TECE.forEach(k => { o[k] = END_BINDOFF; }); END_TRANSF.forEach(k => { o[k] = END_BINDOFF; }); rows.push({ g, o }); };
    const dez = q => { for (let t = 0; t < q; t++) linha([[A, 10]]); };
    const faixa = (k0, k1, v) => { const c = []; for (let k = k0; k <= k1; k++) c.push([pos(k), typeof v === 'function' ? v(k) : v]); return c; };
    tipo = BO_TIPOS[tipo] ? tipo : 's3';
    if (tipo === 'main' || tipo === 'waste') {
      const k0 = todas ? 0 : 1, k1 = todas ? n : n - 1, yy = tipo === 'waste' ? (yDesc || 7) : yarn;
      if (k1 < k0) return rows;
      const cheia = () => linha(faixa(k0, k1, 8), yy), xadrez = par => linha(faixa(k0, k1, k => ((k - k0) % 2 === par ? 8 : 0)).filter(c => c[1]), yy);
      for (let t = 0; t < 3; t++) cheia(); xadrez(1); xadrez(0); xadrez(1); for (let t = 0; t < 3; t++) cheia();
      if (rows.filter(r => r.o[COL_YARN] === yy).length % 2) cheia();   // passadas pares para o guia-fio do descarte
      linha(faixa(k0, k1, 6), 0); linha(faixa(k0, k1, 6), 0);    // solta as malhas (sem fio)
    } else if (n >= 2) {
      const ult = n - 1;   // ultimo passo (k = 1..n-1); Z = pos(n) so tece no fim
      if (tipo === 's3') {
        linha([[A, 8], ...faixa(1, n, 1)]);
        for (let k = 1; k <= ult; k++) { if (k === ult) dez(2); linha([[pos(k), 71]]); }
        linha([[pos(n), 1]]);
      } else if (tipo === 's1') {
        const cod = k => k === ult ? 71 : (k % 2 ? 31 : 51);
        linha([[A, 8], ...faixa(1, n, k => k < n && cod(k) === 51 ? 20 : 1)]);
        for (let k = 1; k <= ult; k++) { if (k === ult) dez(2); linha([[pos(k), cod(k)]]); }
        linha([[pos(n), 1]]);
      } else if (tipo === 's2') {
        linha([[A, 8], ...faixa(1, n, k => k < n ? 20 : 1)]);
        for (let k = 1; k <= ult; k++) { linha([[pos(k), k === ult ? 51 : 91]]); if (k === Math.max(1, ult - 1)) dez(1); linha([[pos(k), 16]]); }
        linha([[pos(n), 1]]);
      } else if (tipo === 'd1' || tipo === 'd2') {
        const d2 = tipo === 'd2';
        linha([[A, 8], ...faixa(1, n, k => d2 && k > 1 && k < n ? 20 : 1)]);
        const ul = n - 2;
        for (let k = 1; k <= ul; k++) { linha(d2 ? [[pos(k), 71], [pos(k + 1), 2]] : [[pos(k), 71], [pos(k + 1), 71]]); if (k === Math.max(1, ul - 1)) dez(2); linha(d2 ? [[pos(k), 16], [pos(k + 1), 110]] : [[pos(k), 16], [pos(k + 1), 16]]); }
        linha([[pos(n - 1), 1], [pos(n), 1]]);
      } else if (tipo === 'alt') {
        linha([[A, 8], ...faixa(1, n, 1)]);
        const ul = Math.max(0, n - 5);
        for (let st = 0; st <= ul; st++) { if (st === ul) dez(2); linha([[pos(st), 16], [pos(st + 1), 71], [pos(st + 3), 8], [pos(st + 4), 16]].filter(c => Math.abs(c[0] - A) <= n)); }
        linha(faixa(Math.max(1, n - 3), n, 1));
      }
    }
    // passadas do guia-fio principal: par (volta ao lado de saida) ou impar
    const cnt = rows.filter(r => r.o[COL_YARN] === yarn).length;
    if ((cnt % 2 === 1) !== !!impar) linha([[tipo === 'main' || tipo === 'waste' ? A : pos(n), 1]]);
    return rows;
  }
  function shapeRows(s, bG, bO, nb, W, bI, jq) {
    const cv = s.forma.cava, dc = s.forma.decote, out = [];
    const evC = cv.ativo ? new Map(agenda(cv.inicio - 1, parsePassos(cv.passos).filter(x => !x.erro))) : new Map();
    const evD = new Map(evDec(dc));
    const polo = ehPolo(dc), PB = carcelaAg(dc), cAlt = Math.max(2, Math.round(+dc.calt || 60)), fechaPano = polo && !!dc.fecha;
    let unido = false, kU = 0;
    let poloFase = 0, poloK = { E: 0, D: 0 }, bs = 0, desl = 0, poloFecha = false;
    const split = dc.ativo ? splitRow(s, dc.inicio) : Infinity;   // divide em carreira par (guia-fio A volta ao lado certo)
    const evs = eventos(s.forma), fa = s.forma.aumento, fb = s.forma.aumento2;
    const evA = new Map(evs.aum), evB = new Map(evs.aum2), ex = extraLado(s.forma);
    const evWd = new Map(evs.cintD), evWa = new Map(evs.cintA), ct = s.forma.cintura || {};
    let L = ex, R = W - 1 - ex - PB;                 // limites da peca inteira (antes da divisao); comeca estreita se tiver aumentos
    const mid = Math.floor(W / 2), meio = dc.ativo && dc.tipo === 'redondo' && dc.meioModo !== 'v' ? +dc.meio : 0;
    let lA = 0, lB = 0, rA = 0, rB = 0;          // depois da divisao: esquerda [lA,lB], direita [rA,rB]
    const borda = (f, k) => Math.max(+f.borda || 2, k);
    // aplica uma diminuicao numa borda: 'L' (borda esquerda anda p/ direita) ou 'R' (borda direita anda p/ esquerda)
    function dim(row, a, b, lado, k, f) {
      const e = Math.min(borda(f, k), b - a + 1 - k); if (e < 1) return [a, b];
      if (lado === 'L') { for (let i = a; i < a + e; i++) row[i] = moveCode(row[i], k, +1); return [a + k, b]; }
      for (let i = b; i > b - e; i--) row[i] = moveCode(row[i], k, -1); return [a, b - k];
    }
    // aumento: borda anda para fora ('L' borda esquerda p/ esquerda, 'R' borda direita p/ direita)
    function aum(row, a, b, lado, k, f) {
      const e = Math.min(borda(f, k), b - a + 1); if (e < 1) return [a, b];
      if (lado === 'L') { if (a - k < 0) return [a, b]; for (let i = a; i < a + e; i++) row[i] = moveCode(row[i], k, -1); return [a - k, b]; }
      if (b + k > W - 1) return [a, b]; for (let i = b; i > b - e; i--) row[i] = moveCode(row[i], k, +1); return [a, b + k];
    }
    // aumento com a cor 16: a agulha nova entra marcada com 16 (sem ponto) e tece a partir da carreira seguinte
    function aum16(row, a, b, lado, k) {
      if (lado === 'L') { if (a - k < 0) return [a, b]; for (let i = a - k; i < a; i++) row[i] = 16; return [a - k, b]; }
      if (b + k > W - 1) return [a, b]; for (let i = b + 1; i <= b + k; i++) row[i] = 16; return [a, b + k];
    }
    const aumC = (row, a, b, lado, k) => ct.modo === '16' ? aum16(row, a, b, lado, k) : aum(row, a, b, lado, k, ct);
    const sisC = sistemas(s), multi = !!(sisC && sisC.length > 1), yA = multi ? sisC[1] : sisC ? sisC[0] : s.guiaFio, yB = multi ? sisC[0] : s.fios[0];
    // PARCIAL (ombro): nas ultimas carreiras da peca as agulhas param de tecer em escada, da borda da cava para o pescoco,
    // e ficam com a malha presa na agulha (parcial); o fio de descarte no fim tece todas de novo (como o "铲肩" da ficha de processo)
    const pc = s.forma.parcial || {}, pcR = pc.ativo ? Math.max(2, 2 * Math.floor((+pc.carreiras || 0) / 2)) : 0, pcIni = pcR ? Math.max(0, nb - pcR) : Infinity, pcN = pcR / 2;
    const pcS = {};   // largura de cada lado quando o parcial comeca
    const pcH = (lado, w, cc) => { if (cc < pcIni) return 0; if (pcS[lado] == null) pcS[lado] = w; const k = Math.max(1, Math.floor(pcS[lado] / (pcN + 1))), j = Math.floor((cc - pcIni) / 2) + 1; return Math.min(pcS[lado] - k, j * k); };
    let c = 0; const info = { divisao: null, cava: [], decote: [], aumento: [], aumento2: [], cintura: [], larguraInicial: W - 2 * ex };
    while (c < nb) {
      if (c < split) {
        const row = bG.slice(c * W, c * W + W); for (let i = 0; i < W; i++) if (i < L || i > R) row[i] = 0;
        protege(row, L, R, c); if (jq[c]) protegeIna(s, bI, W, c, L, R);
        if (evA.has(c)) { const k = evA.get(c); [L] = aum(row, L, R, 'L', k, fa); [, R] = aum(row, L + k, R, 'R', k, fa); L = Math.max(0, L); info.aumento.push(c + 1); }
        else if (evC.has(c)) { const k = evC.get(c); [L] = dim(row, L, R, 'L', k, cv); [, R] = dim(row, L - k, R, 'R', k, cv); info.cava.push(c + 1); }
        if (evWd.has(c)) { const k = evWd.get(c); [L] = dim(row, L, R, 'L', k, ct); [, R] = dim(row, L - k, R, 'R', k, ct); info.cintura.push(c + 1); }
        if (evWa.has(c)) { const k = evWa.get(c); [L] = aumC(row, L, R, 'L', k); [, R] = aumC(row, L + k, R, 'R', k); info.cintura.push(c + 1); }
        if (evB.has(c) && !evA.has(c)) { const k = evB.get(c); [L] = aum(row, L, R, 'L', k, fb); [, R] = aum(row, L + k, R, 'R', k, fb); info.aumento2.push(c + 1); }
        if (c >= pcIni) { const h = pcH('M', Math.floor((R - L + 1) / 2), c); for (let i = L; i < L + h; i++) row[i] = 0; for (let i = R; i > R - h; i--) row[i] = 0; }
        const ina = jq[c] ? bI.slice(c * W, c * W + W).map((v, i) => row[i] ? v : 0) : null;
        out.push({ c, g: row, o: bO.slice(c * WO, (c + 1) * WO), ina, lado: '' }); c++;
        continue;
      }
      if (info.divisao == null) {
        info.divisao = c + 1;
        lA = L; lB = mid - Math.ceil(meio / 2) - (meio ? 0 : 1) + (W % 2 && !meio ? 1 : 0); rA = lB + 1 + meio; rB = R;
        if (polo) { bs = L + Math.floor((R - L + 1 - PB) / 2) - 1; lB = bs + PB - 1; rA = bs; info.carcela = { inicio: c + 1, agulhas: PB, carreiras: cAlt }; }
        // decote redondo: carreira da divisao feita inteira pelo guia-fio do lado direito (que estava na esquerda):
        // tece o lado esquerdo indo p/ direita, fecha o meio com correntinha (71 = tece e passa a malha 1 agulha p/ direita)
        // e tece o lado direito indo p/ direita. Os dois guia-fios terminam cada um do seu lado; nenhuma agulha fica presa.
        if (meio && !polo && !jq[c] && correnteOn(s)) {
          const row = bG.slice(c * W, c * W + W), gE = new Uint8Array(W), gD = new Uint8Array(W);
          for (let i = lA; i <= lB; i++) gE[i] = row[i]; for (let i = rA; i <= rB; i++) gD[i] = row[i];
          protege(gE, lA, lB, c); protege(gD, rA, rB, c);
          const o = bO.slice(c * WO, (c + 1) * WO); o[COL_YARN] = yB; o[COL_LOOP] = 0; o[32] = 0; o[28] = 0; o[29] = 0;
          const M0 = lB + 1, M1 = rA - 1, k = M1 - M0 + 1;
          // malhas do meio que estao na frontura de tras (ribana) passam para a frente antes da correntinha (senao ficam presas atras)
          { const ant = out.length ? out[out.length - 1].g : row, t = new Uint8Array(W);
            for (let i = M0; i <= M1; i++) { const v = ant[i]; if (v && (BACK.has(v) || PURL.has(v))) t[i] = 110; }
            if (t.some(v => v)) { const ot = o.slice(); ot[COL_YARN] = 0; ot[32] = 1; out.push({ c, g: t, o: ot, ina: null, lado: 'T' }); } }
          out.push({ c, g: gE, o: o.slice(), ina: null, lado: 'E' });
          // modulo band-off com numero impar de carreiras: o lado direito sai indo p/ direita
          moduloBindOff8(W, o, yB, M0 - 1, M1 + 1, (s.forma.bandoff || {}).tipo, true, +s.fioDescarte || 7, false).forEach(r => out.push({ c, g: r.g, o: r.o, ina: null, lado: 'B' }));
          out.push({ c, g: gD, o: o.slice(), ina: null, lado: 'D' });
          info.correntinha = { carreira: c + 1, agulhas: k, guiaFio: yB };
          c++; continue;
        }
      }
      // polo: depois de 2 blocos (8 carreiras) com a carcela compartilhada, transfere e desloca o lado direito PB agulhas
      if (polo && poloFase === 2) {
        const ult = (i, lado) => { const v = []; for (let k = out.length - 1; k >= 0 && v.length < 2; k--) if (out[k].lado === lado) v.push(out[k].g[i]); return v; };
        const back = v => BACK.has(v) || v === 5 || v === 10, front = v => v && !(BACK.has(v) || v === 5);
        const temB = (i, lado) => ult(i, lado).some(back), temF = (i, lado) => ult(i, lado).some(front);
        const base = bO.slice(c * WO, (c + 1) * WO); base[COL_YARN] = 0; base[COL_LOOP] = 0; base[32] = 1;
        const t1 = new Uint8Array(W), t2 = new Uint8Array(W), t3 = new Uint8Array(W);
        // so transfere agulha que tem malha (agulha vazia na transferencia = aviso W020 no Raynen)
        const agora = (i, lado) => { for (let k = out.length - 1; k >= 0; k--) if (out[k].lado === lado) return out[k].g[i]; return 0; };
        for (let i = lA; i < bs; i++) if (agora(i, 'E') && temB(i, 'E')) t1[i] = 110;
        for (let i = bs + PB; i <= rB; i++) if (agora(i, 'D') && temF(i, 'D')) t1[i] = 100;
        for (let i = bs; i <= rB; i++) if (agora(i, 'D')) t2[i] = 110;
        for (let i = lA; i < bs; i++) if (agora(i, 'E') && temB(i, 'E')) t3[i] = 100;
        for (let i = bs + PB; i <= rB; i++) if (agora(i, 'D') && temB(i, 'D')) t3[i + PB] = 100;
        const o2 = base.slice(); o2[28] = 1; o2[29] = PB;
        [[t1, base], [t2, o2], [t3, base]].forEach(([g, o]) => { if (g.some(v => v)) out.push({ c, g, o: o.slice(), ina: null, lado: 'T' }); });
        rA += PB; rB += PB; desl = PB; poloFase = 3; info.carcela.transferencia = c + 1;
      }
      // polo com "fechar o pano": quando a carcela termina, o lado direito volta as PB agulhas (as duas carcelas se juntam)
      // e a peca segue inteira, sem decote da gola, com os sistemas alternando como antes da divisao
      if (fechaPano && poloFecha && !unido) {
        const agora = (i, lado) => { for (let k = out.length - 1; k >= 0; k--) if (out[k].lado === lado) return out[k].g[i]; return 0; };
        const ehB = v => BACK.has(v) || v === 5, o = bO.slice(Math.max(0, c - 1) * WO, Math.max(1, c) * WO); o[COL_YARN] = 0; o[COL_LOOP] = 0; o[32] = 1;
        const t1 = new Uint8Array(W), t2 = new Uint8Array(W), t3 = new Uint8Array(W);
        for (let i = rA; i <= rB; i++) { const v = agora(i, 'D'); if (v && !ehB(v)) t1[i] = 100; }
        for (let i = lA; i <= lB; i++) { const v = agora(i, 'E'); if (v && ehB(v)) t1[i] = 110; }
        for (let i = rA; i <= rB; i++) if (agora(i, 'D')) t2[i] = 110;
        for (let i = lA; i <= lB; i++) if (ehB(agora(i, 'E'))) t3[i] = 100;
        for (let i = rA; i <= rB; i++) if (ehB(agora(i, 'D'))) t3[i - desl] = 100;
        const o2 = o.slice(); o2[28] = 0; o2[29] = desl;
        [[t1, o], [t2, o2], [t3, o]].forEach(([g, oo]) => { if (g.some(v => v)) out.push({ c, g, o: oo.slice(), ina: null, lado: 'T' }); });
        L = lA; R = rB - desl; desl = 0; unido = true; info.carcela.fechaPano = c + 1;
      }
      if (unido) {   // peca inteira de novo (uma carreira por vez)
        const row = bG.slice(c * W, c * W + W); for (let i = 0; i < W; i++) if (i < L || i > R) row[i] = 0;
        protege(row, L, R, c);
        if (evC.has(c)) { const k = evC.get(c); [L] = dim(row, L, R, 'L', k, cv); [, R] = dim(row, L - k, R, 'R', k, cv); info.cava.push(c + 1); }
        if (c >= pcIni) { const h = pcH('M', Math.floor((R - L + 1) / 2), c); for (let i = L; i < L + h; i++) row[i] = 0; for (let i = R; i > R - h; i--) row[i] = 0; }
        const o = bO.slice(c * WO, (c + 1) * WO); o[COL_YARN] = kU % 2 === 0 ? yB : yA; kU++;
        out.push({ c, g: row, o, ina: null, lado: 'F' }); c++; continue;
      }
      // blocos de 2 carreiras: esquerda c, c+1 depois direita c, c+1
      const cs = [c, c + 1].filter(x => x < nb);
      const lados = [['E', yA], ['D', yB]];
      for (const [lado, yarn] of lados) for (const cc of cs) {
        let row = bG.slice(cc * W, cc * W + W);
        const [a, b] = lado === 'E' ? [lA, lB] : [rA, rB];
        if (lado === 'D' && desl) { const src = row; row = new Uint8Array(W); for (let i = a; i <= b; i++) row[i] = i - desl >= 0 ? src[i - desl] : 0; }   // a malha andou: mantem o ponto de cada agulha
        for (let i = 0; i < W; i++) if (i < a || i > b) row[i] = 0;
        protege(row, a, b, cc); if (jq[cc]) protegeIna(s, bI, W, cc, a, b);
        if (polo) {   // carcela: 8/9 dos dois lados nas mesmas agulhas; depois 10,9,8,9... (ribana dupla) e fecha com 2
          const b0 = lado === 'E' ? bs : bs + desl;
          let v;
          if (poloFase < 3) v = lado === 'E' ? 8 : 9;
          else { const k = poloK[lado]++; v = k >= cAlt ? 1 : k === cAlt - 1 ? 2 : k === 0 ? 10 : (k % 2 === 0 ? 8 : 9); }
          for (let i = b0; i < b0 + PB; i++) if (i >= a && i <= b) row[i] = v;
        }
        let na = a, nb2 = b;
        if (evC.has(cc)) { const k = evC.get(cc); if (lado === 'E') [na] = dim(row, na, nb2, 'L', k, cv); else [, nb2] = dim(row, na, nb2, 'R', k, cv); }
        if (evD.has(cc)) { const k = evD.get(cc); if (lado === 'E') [, nb2] = dim(row, na, nb2, 'R', k, dc); else [na] = dim(row, na, nb2, 'L', k, dc); }
        if (evA.has(cc)) { const k = evA.get(cc); if (lado === 'E') [na] = aum(row, na, nb2, 'L', k, fa); else [, nb2] = aum(row, na, nb2, 'R', k, fa); }
        if (evB.has(cc)) { const k = evB.get(cc), ext = fb.onde !== 'decote';
          if (lado === 'E') { if (ext) [na] = aum(row, na, nb2, 'L', k, fb); else [, nb2] = aum(row, na, nb2, 'R', k, fb); }
          else { if (ext) [, nb2] = aum(row, na, nb2, 'R', k, fb); else [na] = aum(row, na, nb2, 'L', k, fb); } }
        if (evWd.has(cc)) { const k = evWd.get(cc); if (lado === 'E') [na] = dim(row, na, nb2, 'L', k, ct); else [, nb2] = dim(row, na, nb2, 'R', k, ct); }
        if (evWa.has(cc)) { const k = evWa.get(cc); if (lado === 'E') [na] = aumC(row, na, nb2, 'L', k); else [, nb2] = aumC(row, na, nb2, 'R', k); }
        if (lado === 'E' && evA.has(cc)) info.aumento.push(cc + 1);
        if (lado === 'E' && evB.has(cc)) info.aumento2.push(cc + 1);
        if (lado === 'E') { lA = na; lB = nb2; } else { rA = na; rB = nb2; }
        if (lado === 'E' && evC.has(cc)) info.cava.push(cc + 1);
        if (lado === 'E' && evD.has(cc)) info.decote.push(cc + 1);
        if (cs[0] >= pcIni) { if (lado === 'E') { const h = pcH('E', lB - lA + 1, cs[0]); for (let i = lA; i < lA + h; i++) row[i] = 0; } else { const h = pcH('D', rB - rA + 1, cs[0]); for (let i = rB; i > rB - h; i--) row[i] = 0; } }
        const o = bO.slice(cc * WO, (cc + 1) * WO);
        let ina = null;
        if (jq[cc]) {   // jacquard: o lado direito troca A->C e B->D (sem fio passando pelo decote)
          const mp = lado === 'D' ? new Map([[s.guiaFio, s.fios[1]], [s.fios[0], s.fios[2]]]) : null;
          ina = bI.slice(cc * W, cc * W + W).map((v, i) => row[i] ? (mp && mp.has(v) ? mp.get(v) : v) : 0);
        } else o[COL_YARN] = yarn;
        out.push({ c: cc, g: row, o, ina, lado, sh: lado === 'D' ? desl : 0 });
      }
      c += 2; if (polo && poloFase < 2) poloFase++;
      // polo: quando a carcela dos dois lados termina, as malhas da ribana que ficaram atras voltam para a frente (sem agulha de tras parada: W021)
      if (polo && poloFase === 3 && !poloFecha && poloK.E >= cAlt && poloK.D >= cAlt) {
        const t = new Uint8Array(W), o = bO.slice((c - 1) * WO, c * WO); o[COL_YARN] = 0; o[COL_LOOP] = 0; o[32] = 1;
        for (let i = bs; i < bs + PB; i++) if (i >= lA && i <= lB) t[i] = 110;
        for (let i = bs + desl; i < bs + desl + PB; i++) if (i >= rA && i <= rB) t[i] = 110;
        if (t.some(v => v)) out.push({ c: c - 1, g: t, o, ina: null, lado: 'T' });
        poloFecha = true;
      }
    }
    // polo: no fim o lado direito volta as PB agulhas para a esquerda, para nenhuma agulha ficar fora da largura do inicio (W041)
    if (polo && desl) {
      const o = bO.slice((nb - 1) * WO, nb * WO); o[COL_YARN] = 0; o[COL_LOOP] = 0; o[32] = 1;
      const ultD = out.filter(r => r.lado === 'D').slice(-2), ultE = out.filter(r => r.lado === 'E').slice(-2);
      const t1 = new Uint8Array(W), t2 = new Uint8Array(W);
      for (let i = rA; i <= rB; i++) if (ultD.some(r => r.g[i] && !(BACK.has(r.g[i]) || r.g[i] === 5))) t1[i] = 100;   // direito: tudo para tras
      for (let i = lA; i <= lB; i++) if (ultE.some(r => BACK.has(r.g[i]) || r.g[i] === 5 || r.g[i] === 10)) t1[i] = 110;   // esquerdo: tudo para a frente
      for (let i = rA; i <= rB; i++) if (ultD.some(r => r.g[i])) t2[i] = 110;
      const o2 = o.slice(); o2[28] = 0; o2[29] = desl;
      if (t1.some(v => v)) out.push({ c: nb - 1, g: t1, o: o.slice(), ina: null, lado: 'T' });
      out.push({ c: nb - 1, g: t2, o: o2, ina: null, lado: 'T' });
      info.carcela.volta = true;
    }
    // 2+ sistemas: como no fim do 25009F, a ultima carreira e tecida pelo guia-fio do lado direito de ponta a ponta
    // (lado direito, passa pelo decote, lado esquerdo): ele volta ao lado de saida com passadas pares, sem arrasto longo (W002/W028)
    if (unido) {   // passadas pares: completa com 1 carreira inteira do guia-fio que ficou impar
      const cnt = {}; out.forEach(r => { const y = r.o[COL_YARN]; if (y) cnt[y] = (cnt[y] || 0) + 1; });
      const ult = out.filter(r => r.lado === 'F').pop();
      [yB, yA].forEach(y => { if (ult && cnt[y] % 2) { const o = ult.o.slice(); o[COL_YARN] = y; out.push({ c: ult.c, g: ult.g.slice(), o, ina: null, lado: 'F' }); } });
    } else if (multi && info.divisao != null) {
      const ud = out.filter(r => r.lado === 'D').pop(), ue = out.filter(r => r.lado === 'E').pop();
      if (ud) { const g = new Uint8Array(W), d = (polo && desl) ? desl : 0;
        if (ue) for (let i = 0; i < W; i++) if (ue.g[i]) g[i] = ue.g[i];
        for (let i = 0; i < W; i++) if (ud.g[i] && i - d >= 0) g[i - d] = g[i - d] || ud.g[i];
        const o = ud.o.slice(); o[COL_YARN] = yB;
        out.push({ c: ud.c, g, o, ina: null, lado: 'F', sh: 0, extra: true }); info.ultimaInteira = true; }
    }
    // passadas pares para cada guia-fio (W002): o que ficou impar tece mais uma vez a sua ultima carreira
    { const cnt = {}; out.forEach(r => { const y = r.o[COL_YARN]; if (y && r.lado !== 'T') cnt[y] = (cnt[y] || 0) + 1; });
      Object.keys(cnt).forEach(y => { if (cnt[y] % 2) { const ult = out.filter(r => r.o[COL_YARN] === +y && r.lado !== 'B' && r.lado !== 'T').pop(); if (ult) out.push(Object.assign({}, ult, { g: ult.g.slice(), o: ult.o.slice(), extra: true })); } }); }
    // FIM DA PECA COM BAND-OFF (modulo): fecha todas as agulhas em cima, cada lado com o seu guia-fio (endereco #09)
    if (s.forma.bandoff && s.forma.bandoff.ativo && !pcR && out.length) {
      const segs = info.divisao != null && !unido ? [[lA, lB, yA, 1], [rA, rB, yB, -1]] : [[L, R, yA, 1]];
      const ult = out.filter(r => r.lado !== 'T' && r.lado !== 'B').pop(), cB = ult.c;
      segs.forEach(([a, b, y, dir]) => {
        if (b - a < 1) return;
        const ant = out.filter(r => r.lado !== 'T' && r.lado !== 'B' && r.g.slice(a, b + 1).some(v => v)).pop(), t = new Uint8Array(W);
        if (ant) for (let i = a; i <= b; i++) { const v = ant.g[i]; if (v && (BACK.has(v) || PURL.has(v))) t[i] = 110; }
        const base = ult.o.slice(); base[COL_END] = 0;
        if (t.some(v => v)) { const ot = base.slice(); ot[COL_YARN] = 0; ot[32] = 1; ot[28] = 0; ot[29] = 0; out.push({ c: cB, g: t, o: ot, ina: null, lado: 'T' }); }
        moduloBindOff8(W, base, y, dir > 0 ? a : b, dir > 0 ? b : a, (s.forma.bandoff || {}).tipo, false, +s.fioDescarte || 7, true).forEach(r => out.push({ c: cB, g: r.g, o: r.o, ina: null, lado: 'B' }));
      });
      info.bandoffFim = segs.map(([a, b]) => b - a + 1);
    }
    if (pcR) info.parcial = { inicio: pcIni + 1, carreiras: pcR, faixas: info.divisao != null && !unido ? [[lA, lB], [rA, rB]] : [[L, R]] };
    return { rows: out, info };
  }

  // ---- dados para a simulacao da peca: cursos (de baixo p/ cima) com cor (1-4) e tipo (1 frente, 2 tras, 3 carregado) por agulha ----
  const PURL = new Set([2, 9, 12, ...R(40, 59), ...R(80, 99), ...R(105, 109), 113, 114, 115, 189, 234, 235, 236, 237, 238, 239]);
  const TUCK = new Set([4, 5, 6, 7, 14]);
  const NONE = new Set([0, 15, 16, 17, 100, 110, 18, 19, 224, 225, 254, 255]);
  // 4 = malha frente que anda p/ esquerda (inclinada), 5 = anda p/ direita (diminuicoes/aumentos)
  const LEAN_L = new Set([...R(21, 27), ...R(61, 67), ...R(101, 104), 228, 229, 230]), LEAN_R = new Set([...R(31, 37), ...R(71, 77), 88, 89, 98, 99, 231, 232, 233]);
  // tipos da simulacao: 1 frente, 2 tras, 3 carregado frente, 4/5 inclinado (transferencia), 6 tranca por baixo, 7 tranca por cima, 8 carregado atras, 9 tras sem ligacao
  const CAB_UNDER = new Set([28, 48, 38, 58]), CAB_OVER = new Set([29, 49, 39, 59]);
  function stitchType(v) {
    if (NONE.has(v)) return 0; if (v >= 120 && v <= 183) return 1;
    if (CAB_UNDER.has(v)) return 6; if (CAB_OVER.has(v)) return 7;
    if (v === 5) return 8; if (v === 4 || v === 14) return 3; if (v === 6) return 1; if (v === 7) return 2; if (v === 9) return 9;
    if (PURL.has(v)) return 2; if (TUCK.has(v)) return 3; if (LEAN_L.has(v)) return 4; if (LEAN_R.has(v)) return 5; return 1;
  }
  function simData(s, W, rowsList) {   // rowsList: [{key, g (Uint8Array W), yarn, cor?: (i)=>indice}]
    const sisS = sistemas(s) || [], yarnIdx = y => sisS.includes(y) || y === s.guiaFio ? 1 : y === s.fios[0] ? 2 : y === s.fios[1] ? 3 : y === s.fios[2] ? 4 : 0;
    const map = new Map(), order = [];
    rowsList.forEach(r => {
      let cIdx = r.cor ? null : yarnIdx(r.yarn); if (!r.cor && !cIdx) return;   // fio de descarte nao entra
      let cur = map.get(r.key); if (!cur) { cur = { col: new Uint8Array(W), typ: new Uint8Array(W) }; map.set(r.key, cur); order.push(r.key); }
      for (let i = 0; i < W; i++) {
        const v = r.g[i], t = stitchType(v); if (!t) continue;
        const col = r.cor ? r.cor(i, v) : cIdx; if (!col) continue;
        if (!cur.typ[i] || (t === 1 && cur.typ[i] === 3)) { cur.typ[i] = t; cur.col[i] = col; }
      }
    });
    // carreira so com 9 (tras sem ligacao, ex. camada de ar) fica escondida atras da frente; misturada vira malha tras
    const cursos = order.map(k => map.get(k)).filter(c => c.typ.some(t => t && t !== 9));
    cursos.forEach(c => { for (let i = 0; i < W; i++) if (c.typ[i] === 9) c.typ[i] = 2; });
    return { cols: W, cursos };
  }

  function build(spec) {
    if (!T) throw new Error('modelo não carregado');
    const { spec: s0, erros } = check(spec);
    if (erros.length) throw new Error(erros.join('\n'));
    if (s0.ponto.tipo === 'base') return buildBase(s0);
    let { N } = planRows(s0);
    if (s0.forma && s0.forma.decote.ativo && s0.ponto.tipo !== 'jacquard') {   // cada lado do decote com passadas pares
      const sp = splitRow(s0, s0.forma.decote.inicio); if ((N - sp) % 2) N++;
    }
    const EX = s0.forma ? extraLado(s0.forma) : 0, W0 = s0.largura;          // aumentos: largura inicial W0, maxima W0 + 2*EX
    const PB = s0.forma ? carcelaAg(s0.forma.decote) : 0;   // polo: o lado direito anda PB agulhas para a direita
    const s = Object.assign({}, s0, { carreiras: N, largura: W0 + 2 * EX + PB });
    const body = bodyRows(s, N), sisB = sistemas(s);
    protOff = s.ponto.tipo === 'jacquard' && s.ponto.metodo === 'expandido';
    const W = s.largura, isMod = s.ponto.tipo === 'jacquard' && s.ponto.metodo === 'modulo';
    const B0 = s.base || null, S0 = B0 ? B0.rows : START;
    // corpo calculado primeiro em memoria (para poder aplicar cava/decote), depois copiado para o BMP
    const nb = body.length, bG = new Uint8Array(nb * W), bO = new Uint8Array(nb * WO), bI = new Uint8Array(nb * W);
    let bodyOut = null;   // definido depois do laco do corpo
    const rowsMax = S0 + 2 * nb + 4 + (isMod ? 29 : 0) + Math.max(0, +s.descarte || 0) + 12 + 3 * W;
    const grid = new Uint8Array(rowsMax * WB);            // linha 0 = carreira 1 (BMP de baixo para cima)
    const opt = new Uint8Array(rowsMax * WO);
    if (B0) {
      // base do programador: copia o inicio/barra do programa dele; mais largo que a base repete o periodo da direita
      const p = B0.periodo || 4, bw = B0.w;
      const bx = i => i < bw ? i : i - p * Math.ceil((i - (bw - 1)) / p);
      for (let y = 0; y < S0; y++) {
        for (let i = 0; i < W0; i++) { const j = bx(i); grid[y * WB + X0 + EX + i] = j >= 0 ? B0.grid[y * bw + j] : 0; }
        opt.set(B0.opt.subarray(y * WO, (y + 1) * WO), y * WO);
      }
    } else for (let y = 0; y < START; y++) {
      for (let x = X0; x < X0 + W0; x++) grid[y * WB + x + EX] = T.start[y * T.startW + srcX(x)];
      opt.set(T.opt.subarray(y * WO, (y + 1) * WO), y * WO);
      if (opt[y * WO + COL_LOOP]) opt[y * WO + COL_LOOP] = s.ribanaRep;   // laco da ribana (201)
    }
    const bp = B0 ? null : BARRAS[s.barra];
    if (bp) for (let y = 15; y <= 23; y++) for (let x = X0; x < X0 + W0; x++) grid[y * WB + x + EX] = bp[(x - X0) % bp.length];
    const tmpl = T.opt.slice(25 * WO, 26 * WO); tmpl[COL_LOOP] = 0;
    const ina = new Uint8Array(rowsMax * WB), hasIna = body.some(b => b.jq);
    const crosses = [], passes = {};
    body.forEach((br, k0) => {
      const y = S0 + k0, row = k0 * W - X0, r = br.r;    // row: indice em bG (coluna X0 = 0)
      for (let i = 0; i < W; i++) bG[row + X0 + i] = br.v(i);
      if (br.jq) for (let i = 0; i < W; i++) bI[row + X0 + i] = yarnOf(s, br.ina(i));
      if (r != null && !br.faixa) s.trancas.forEach((t, k) => {
        const cx = X0 + EX + t.agulha - 1, g = t.grupo;
        for (let j = 0; j < 2 * g; j++) bG[row + cx + j] = 1;
        for (let j = 0; j < t.lateral; j++) { bG[row + cx - 1 - j] = 2; bG[row + cx + 2 * g + j] = 2; }
        const p = t.primeiro - 1;
        if (r >= p && (r - p) % t.intervalo === 0 && r < N - 2) {
          const [lo, hi] = (k % 2 === 0) ? [28, 29] : [48, 49];   // grupos 1 e 2 do manual
          const [L, Rr] = t.sentido === 'dir' ? [hi, lo] : [lo, hi];
          for (let j = 0; j < g; j++) { bG[row + cx + j] = L; bG[row + cx + g + j] = Rr; }
          if (k === 0) crosses.push(k0);
        }
      });
      const o = tmpl.slice();
      if (br.jq) {
        o[COL_YARN] = 0; o[COL_216] = s.ponto.cores; o[COL_216 + 1] = s.ponto.avesso;
      } else o[COL_YARN] = yarnRow(s, br, sisB);
      bO.set(o, k0 * WO);
    });
    if (!formaAtiva(s) && !(s.ponto.tipo === 'jacquard' && s.ponto.metodo === 'expandido')) for (let k = 0; k < nb; k++) {
      const row = bG.subarray(k * W, k * W + W); let a = -1, b = -1; for (let i = 0; i < W; i++) if (row[i]) { if (a < 0) a = i; b = i; }
      protege(row, a, b, k); if (body[k].jq) protegeIna(s, bI, W, k, a, b);
    }
    // cava / decote (formas) ou o corpo como esta
    const fr = formaAtiva(s) ? shapeRows(s, bG, bO, nb, W, bI, body.map(b => !!b.jq)) : { rows: Array.from({ length: nb }, (_, k) => ({ c: k, g: bG.subarray(k * W, k * W + W), o: bO.subarray(k * WO, (k + 1) * WO) })), info: null };
    bodyOut = fr.rows;
    // garantia: toda carreira que tece tem guia-fio (so a carreira de transferencia fica sem, como no 25009F)
    { const ult = {}; bodyOut.forEach(rw => { const o = rw.o, tece = Array.prototype.some.call(rw.g, v => v && v !== 100 && v !== 110 && v !== 16 && v !== 17);
        if (o[COL_YARN]) { ult[rw.lado || ''] = o[COL_YARN]; ult.x = o[COL_YARN]; return; }
        if (rw.lado === 'B') return;   // band-off: carreira de soltar fica sem fio de proposito
        if (tece && !o[COL_216] && !rw.ina && !(body[rw.c] && body[rw.c].jq)) { const y = ult[rw.lado || ''] || ult.x || yarnRow(s, body[rw.c] || { f: 1 }, sisB) || s.guiaFio; const oo = o.slice(); oo[COL_YARN] = y; rw.o = oo; } }); }
    bodyOut.forEach((rw, k) => {
      const y = S0 + k;
      grid.set(rw.g, y * WB + X0);
      const o = rw.o.slice(); o[COL_END] = k === bodyOut.length - 1 ? 1 : 0;
      opt.set(o, y * WO);
      if (hasIna) ina.set(rw.ina || bI.subarray(rw.c * W, rw.c * W + W), y * WB + X0);
      if (body[rw.c] && body[rw.c].jq) for (let k = 1; k <= s.ponto.cores; k++) { const gy = rw.lado === 'D' ? yarnOf(s, k + 2) : yarnOf(s, k); passes[gy] = (passes[gy] || 0) + 1; }
      if (o[COL_YARN]) passes[o[COL_YARN]] = (passes[o[COL_YARN]] || 0) + 1;
    });
    // fio de descarte no fim (gola/acessorio para cerzir): carreiras de meia malha com o guia-fio de descarte
    const pinf = fr.info && fr.info.parcial, ND = Math.max(0, +s.descarte || 0, pinf ? 10 : 0);
    if (ND) {
      opt[(S0 + bodyOut.length - 1) * WO + COL_END] = 0;
      for (let k = 0; k < ND; k++) {
        const y = S0 + bodyOut.length + k, o = tmpl.slice(); o[COL_YARN] = +s.fioDescarte || 7; o[COL_END] = k === ND - 1 ? 1 : 0;
        if (pinf) pinf.faixas.forEach(([a, b]) => { for (let i = a; i <= b; i++) grid[y * WB + X0 + i] = 1; }); else for (let i = 0; i < W; i++) grid[y * WB + X0 + i] = 1;
        opt.set(o, y * WO); passes[o[COL_YARN]] = (passes[o[COL_YARN]] || 0) + 1;
      }
    }
    for (let k = 0; k < crosses.length; k++) crosses[k] = S0 + crosses[k] + 1;
    // simulacao: inicio/barra + corpo agrupado por curso
    const simRows = [];
    { let y = 0, rep = 0;   // laco (201) da barra repetido como na maquina
      while (y < S0) {
        const L = opt[y * WO + COL_LOOP];
        if (L > 1) { let e = y; while (e + 1 < S0 && opt[(e + 1) * WO + COL_LOOP] === L) e++;
          for (let t = 0; t < L; t++) for (let yy = y; yy <= e; yy++) simRows.push({ key: 's' + (rep++), g: grid.subarray(yy * WB + X0, yy * WB + X0 + W - PB), yarn: opt[yy * WO + COL_YARN] });
          y = e + 1; continue; }
        simRows.push({ key: 's' + (rep++), g: grid.subarray(y * WB + X0, y * WB + X0 + W - PB), yarn: opt[y * WO + COL_YARN] }); y++;
      } }
    const pj = s.ponto;
    bodyOut.forEach((rw, k) => {
      if (rw.lado === 'B') return;   // correntinha do decote: nao entra na simulacao como carreira
      const br = body[rw.c], key = br && br.course != null ? 'c' + br.course : 'b' + rw.c;
      let cor = null;
      if (br && br.jq) { const ii = rw.ina || bI.subarray(rw.c * W, rw.c * W + W), dir = rw.lado === 'D'; cor = i => { const y = ii[i]; const c = y === s.guiaFio ? 1 : y === s.fios[0] ? 2 : y === s.fios[1] ? 3 : y === s.fios[2] ? 4 : 1; return dir && c > 2 ? c - 2 : c; }; }
      else if (br && br.mod) cor = (i, v) => v === 121 ? 2 : 1;
      else if (pj.tipo === 'jacquard' && pj.metodo === 'expandido' && br && br.course != null) { const f = br.f; cor = (i, v) => v === 8 ? f : 0; }
      else { const f = (br && br.f) || 1; cor = () => f; }   // cor pelo fio do ponto (no decote o lado direito usa outro guia-fio, mas e o mesmo fio)
      simRows.push({ key, g: rw.sh ? rw.g.subarray(rw.sh, rw.sh + W - PB) : rw.g.subarray(0, W - PB), yarn: rw.o[COL_YARN], cor });
    });
    const sim = simData(s, W - PB, simRows);
    const rows = S0 + bodyOut.length + ND + (isMod ? 29 : 0);
    let modDef = null;
    if (isMod) {
      // definicao do modulo (copiada da estrutura do 45018FG): 14 linhas vazias acima da linha de fim
      const d0 = S0 + bodyOut.length + 13, x0 = X0 + Math.max(2, Math.floor(W * 0.45));
      const A = [[10, 8, 16, 9], [8, 10, 16, 9], [8, 10, 9, 16], [10, 8, 9, 16]];
      const B = [[16, 9, 10, 8], [9, 16, 8, 10], [9, 16, 8, 10], [16, 9, 10, 8]];
      const put = (y, vals) => vals.forEach((v, j) => { grid[y * WB + x0 + j] = v; });
      for (let k = 0; k <= 14; k++) opt[(d0 + k) * WO + 3] = 2;              // 201 col.3: faixa do modulo
      put(d0, [120, 120, 121, 121]);
      for (let pg = 0; pg < 4; pg++) {
        const ya = d0 + 3 + 2 * pg, yb = ya + 1;
        put(ya, A[pg]); put(yb, B[pg]);
        opt[ya * WO + 4] = pg + 1; opt[yb * WO + 4] = pg + 1;                 // 201 col.4: pagina
        opt[yb * WO + COL_YARN] = yarnOf(s, 2);                               // 2a passada: guia-fio da cor 2
      }
      put(d0 + 13, [102, 102, 102, 102]);                                      // identificacao: jacquard
      modDef = { linha: d0 + 1, coluna: x0 };
      const nA = body.filter(b => b.mod).length;
      passes[yarnOf(s, 2)] = (passes[yarnOf(s, 2)] || 0) + nA;                 // cada carreira do desenho = 2 passadas
    }
    const bmp = new Uint8Array(OFF + WB * H); bmp.set(T.bmpHeader); bmp.set(grid.subarray(0, Math.min(rows, H) * WB), OFF);
    const optf = new Uint8Array(OFF + WO * H); optf.set(T.optHeader); optf.set(opt.subarray(0, Math.min(rows, H) * WO), OFF);
    let inaf = null, jqdf = null;
    if (hasIna) { inaf = new Uint8Array(OFF + WB * H); inaf.set(T.bmpHeader); inaf.set(ina.subarray(0, Math.min(rows, H) * WB), OFF); jqdf = new Uint8Array(OFF + WB * H); jqdf.set(T.bmpHeader); }
    if (B0) for (let y = 0; y < S0; y++) { const f = opt[y * WO + COL_YARN]; if (f) passes[f] = (passes[f] || 0) + (opt[y * WO + COL_LOOP] || 1); }
    else passes[3] = (passes[3] || 0) + 14 + 4 * (s.ribanaRep - 1);
    return { spec: s, modDef, bmp, opt: optf, ina: inaf, jqd: jqdf, inaGrid: hasIna ? ina : null, grid, rows, width: W, crosses, passes, passadas: passes[s.guiaFio], bodyRows: bodyOut.length, start: S0, forma: fr.info, sim };
  }

  // programa inteiro da base, como o programador salvou (largura e carreiras da base)
  function buildBase(s0) {
    const B = s0.base, W = B.w, rows = B.h, s = Object.assign({}, s0, { largura: W, carreiras: B.h - B.rows });
    const grid = new Uint8Array(rows * WB), opt = new Uint8Array(rows * WO), passes = {};
    for (let y = 0; y < rows; y++) {
      grid.set(B.grid.subarray(y * W, y * W + W), y * WB + X0);
      opt.set(B.opt.subarray(y * WO, (y + 1) * WO), y * WO);
      const f = opt[y * WO + COL_YARN]; if (f) passes[f] = (passes[f] || 0) + (opt[y * WO + COL_LOOP] || 1);
    }
    const bmp = new Uint8Array(OFF + WB * H); bmp.set(T.bmpHeader); bmp.set(grid, OFF);
    const optf = new Uint8Array(OFF + WO * H); optf.set(T.optHeader); optf.set(opt, OFF);
    const simRows = []; for (let y = 0; y < rows; y++) { const f = opt[y * WO + COL_YARN]; if (f) simRows.push({ key: 'r' + y, g: grid.subarray(y * WB + X0, y * WB + X0 + W), yarn: f, cor: () => 1 }); }
    return { spec: s, modDef: null, bmp, opt: optf, ina: null, jqd: null, inaGrid: null, grid, rows, width: W, crosses: [], passes, passadas: passes[s.guiaFio] || 0, bodyRows: rows - B.rows, start: B.rows, sim: simData(s, W, simRows) };
  }

  // zip simples (sem compressao) para BMP + opt + ficha
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const enc = s => new TextEncoder().encode(s), parts = [], central = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
      dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    files.forEach(f => {
      const name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
      if (/[^\x00-\x7f]/.test(f.name)) h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      if (/[^\x00-\x7f]/.test(f.name)) c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(new Uint8Array(h.buffer), name, data); central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; all.forEach(a => { out.set(a, p); p += a.length; }); return out;
  }
  // le um BMP/OPT de 8 bits (exportado pelo Raynen): devolve {w,h,px} com linha 0 = carreira 1
  function readBmp8(buf) {
    const d = new DataView(buf.buffer || buf, buf.byteOffset || 0);
    if (d.getUint8(0) !== 0x42 || d.getUint8(1) !== 0x4D) throw new Error('não é BMP');
    const off = d.getUint32(10, true), w = d.getInt32(18, true), hh = d.getInt32(22, true), bpp = d.getUint16(28, true);
    if (bpp !== 8) throw new Error('BMP de ' + bpp + ' bits: precisa ser 8 bits (exportado pelo Raynen)');
    const h = Math.abs(hh), stride = (w + 3) & ~3, src = new Uint8Array(d.buffer, d.byteOffset + off), px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { const sy = hh > 0 ? y : h - 1 - y; px.set(src.subarray(sy * stride, sy * stride + w), y * w); }
    return { w, h, px };
  }
  return { moduloBindOff, moduloBindOff8, BO_TIPOS, sistemas, extraLado, fimForma, readBmp8, COL_LOOP, COL_YARN, BARRAS, load, check, build, zip, normalize, MOTIF_CODES, KNITS, get palette() { return T && T.palette; }, START };
})();
if (typeof module !== 'undefined') module.exports = RAYNEN;
