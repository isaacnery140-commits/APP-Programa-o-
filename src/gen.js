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
  const MOTIF_CODES = [...R(0, 14), 16, ...R(20, 27), ...R(30, 37), ...R(40, 47), ...R(50, 57), ...R(60, 99), 100, 110, 28, 29, 38, 39, 48, 49, 58, 59]
    .filter((v, i, arr) => arr.indexOf(v) === i).sort((x, y) => x - y);
  const TESTED = new Set([1, 2, 5, 28, 29, 8, 9, 10, 100, 110]);
  const KNITS = new Set([1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, ...R(20, 27), ...R(30, 37), ...R(40, 47), ...R(50, 57), ...R(60, 99), 28, 29, 38, 48, 49, 58]);
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
    n.nome = String(n.nome || 'NOVO').replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 40) || 'NOVO';
    return n;
  }
  const yarnOf = (s, idx) => idx <= 1 ? s.guiaFio : (s.fios[idx - 2] || s.guiaFio);

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
        for (let c = 0; c < N; c++) for (let k = 1; k <= n; k++)
          rows.push({ v: i => colorAt(c, i) === k ? 8 : ((X0 + i) % 2 === 0 ? 9 : 0), f: k, course: c });
      } else {
        // compacto (como o 3Q): BMP = malha frente; camada INA = guia-fio de cada ponto; funcao 216 = cores/avesso
        for (let c = 0; c < N; c++) rows.push({ v: () => 1, ina: i => colorAt(c, i), jq: true, course: c, f: 0 });
      }
      return rows;
    }
    const m = p.tipo === 'motivo' ? p.motivo : null, fm = m && Array.isArray(p.fios) ? p.fios : null;
    if (m && m.flat().some(v => NOCONN.has(v))) for (let t = 0; t < 2; t++) rows.push({ v: () => 1, f: 1, trans: true });
    for (let r = 0; r < N; r++) {
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
    for (let k = 0; k < 4 * Math.max(1, h); k++) {
      const cnt = {}; bodyRows(s, N + k).forEach(r => { cnt[r.f] = (cnt[r.f] || 0) + 1; });
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
    if (!erros.length) {
      const { N, note } = planRows(s);
      if (note) avisos.push({ tipo: 'auto', txt: note });
      const total = (s.base ? s.base.rows : START) + bodyRows(s, N).length + (p.tipo === 'jacquard' && p.metodo === 'modulo' ? 29 : 0);
      if (total > H) erros.push(`Programa longo demais: ${total} carreiras no desenho (máximo ${H}). Diminua o corpo.`);
    }
    if (s.largura % 2 === 0) avisos.push({ tipo: 'nota', txt: 'Largura par: a última agulha cai numa posição de "trás" da ribana. Se o Raynen avisar W021 na última coluna, use largura ímpar.' });
    return { spec: s, erros, avisos };
  }

  function build(spec) {
    if (!T) throw new Error('modelo não carregado');
    const { spec: s0, erros } = check(spec);
    if (erros.length) throw new Error(erros.join('\n'));
    if (s0.ponto.tipo === 'base') return buildBase(s0);
    const { N } = planRows(s0);
    const s = Object.assign({}, s0, { carreiras: N });
    const body = bodyRows(s, N);
    const W = s.largura, isMod = s.ponto.tipo === 'jacquard' && s.ponto.metodo === 'modulo';
    const B0 = s.base || null, S0 = B0 ? B0.rows : START;
    const rows = S0 + body.length + (isMod ? 29 : 0);
    const grid = new Uint8Array(rows * WB);            // linha 0 = carreira 1 (BMP de baixo para cima)
    const opt = new Uint8Array(rows * WO);
    if (B0) {
      // base do programador: copia o inicio/barra do programa dele; mais largo que a base repete o periodo da direita
      const p = B0.periodo || 4, bw = B0.w;
      const bx = i => i < bw ? i : i - p * Math.ceil((i - (bw - 1)) / p);
      for (let y = 0; y < S0; y++) {
        for (let i = 0; i < W; i++) { const j = bx(i); grid[y * WB + X0 + i] = j >= 0 ? B0.grid[y * bw + j] : 0; }
        opt.set(B0.opt.subarray(y * WO, (y + 1) * WO), y * WO);
      }
    } else for (let y = 0; y < START; y++) {
      for (let x = X0; x < X0 + W; x++) grid[y * WB + x] = T.start[y * T.startW + srcX(x)];
      opt.set(T.opt.subarray(y * WO, (y + 1) * WO), y * WO);
      if (opt[y * WO + COL_LOOP]) opt[y * WO + COL_LOOP] = s.ribanaRep;   // laco da ribana (201)
    }
    const bp = B0 ? null : BARRAS[s.barra];
    if (bp) for (let y = 15; y <= 23; y++) for (let x = X0; x < X0 + W; x++) grid[y * WB + x] = bp[(x - X0) % bp.length];
    const tmpl = T.opt.slice(25 * WO, 26 * WO); tmpl[COL_LOOP] = 0;
    const ina = new Uint8Array(rows * WB), hasIna = body.some(b => b.jq);
    const crosses = [], passes = {};
    body.forEach((br, k0) => {
      const y = S0 + k0, row = y * WB, r = br.r;
      for (let i = 0; i < W; i++) grid[row + X0 + i] = br.v(i);
      if (br.jq) for (let i = 0; i < W; i++) ina[row + X0 + i] = yarnOf(s, br.ina(i));
      if (r != null) s.trancas.forEach((t, k) => {
        const cx = X0 + t.agulha - 1, g = t.grupo;
        for (let j = 0; j < 2 * g; j++) grid[row + cx + j] = 1;
        for (let j = 0; j < t.lateral; j++) { grid[row + cx - 1 - j] = 2; grid[row + cx + 2 * g + j] = 2; }
        const p = t.primeiro - 1;
        if (r >= p && (r - p) % t.intervalo === 0 && r < N - 2) {
          const [lo, hi] = (k % 2 === 0) ? [28, 29] : [48, 49];   // grupos 1 e 2 do manual
          const [L, Rr] = t.sentido === 'dir' ? [hi, lo] : [lo, hi];
          for (let j = 0; j < g; j++) { grid[row + cx + j] = L; grid[row + cx + g + j] = Rr; }
          if (k === 0) crosses.push(y + 1);
        }
      });
      const o = tmpl.slice();
      if (br.jq) {
        o[COL_YARN] = 0; o[COL_216] = s.ponto.cores; o[COL_216 + 1] = s.ponto.avesso;
        for (let k = 1; k <= s.ponto.cores; k++) { const g = yarnOf(s, k); passes[g] = (passes[g] || 0) + 1; }
      } else { o[COL_YARN] = yarnOf(s, br.f); passes[o[COL_YARN]] = (passes[o[COL_YARN]] || 0) + 1; }
      if (k0 === body.length - 1) o[COL_END] = 1;
      opt.set(o, y * WO);
    });
    let modDef = null;
    if (isMod) {
      // definicao do modulo (copiada da estrutura do 45018FG): 14 linhas vazias acima da linha de fim
      const d0 = S0 + body.length + 13, x0 = X0 + Math.max(2, Math.floor(W * 0.45));
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
    const bmp = new Uint8Array(OFF + WB * H); bmp.set(T.bmpHeader); bmp.set(grid, OFF);
    const optf = new Uint8Array(OFF + WO * H); optf.set(T.optHeader); optf.set(opt, OFF);
    let inaf = null, jqdf = null;
    if (hasIna) { inaf = new Uint8Array(OFF + WB * H); inaf.set(T.bmpHeader); inaf.set(ina, OFF); jqdf = new Uint8Array(OFF + WB * H); jqdf.set(T.bmpHeader); }
    if (B0) for (let y = 0; y < S0; y++) { const f = opt[y * WO + COL_YARN]; if (f) passes[f] = (passes[f] || 0) + (opt[y * WO + COL_LOOP] || 1); }
    else passes[3] = (passes[3] || 0) + 14 + 4 * (s.ribanaRep - 1);
    return { spec: s, modDef, bmp, opt: optf, ina: inaf, jqd: jqdf, inaGrid: hasIna ? ina : null, grid, rows, width: W, crosses, passes, passadas: passes[s.guiaFio], bodyRows: body.length, start: S0 };
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
    return { spec: s, modDef: null, bmp, opt: optf, ina: null, jqd: null, inaGrid: null, grid, rows, width: W, crosses: [], passes, passadas: passes[s.guiaFio] || 0, bodyRows: rows - B.rows, start: B.rows };
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
  return { readBmp8, COL_LOOP, COL_YARN, BARRAS, load, check, build, zip, normalize, MOTIF_CODES, KNITS, get palette() { return T && T.palette; }, START };
})();
if (typeof module !== 'undefined') module.exports = RAYNEN;
