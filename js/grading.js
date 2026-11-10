/* Answer checking and a small safe math evaluator (calculator + graph curves). No eval(). */
(function (SPS) {
  'use strict';

  function parseNumeric(value) {
    const s = String(value ?? '').trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '').replace(/^\+/, '').replace(/−/g, '-');
    if (!s) return NaN;
    if (/^-?\d*\.?\d+\/-?\d*\.?\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return b === 0 ? NaN : a / b; }
    if (/^-?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(s)) return Number(s.replace('%', ''));
    return NaN;
  }
  const isNumeric = v => Number.isFinite(parseNumeric(v));

  function numericEquals(a, b, tolerance) {
    if (String(a).trim().toLowerCase() === String(b).trim().toLowerCase()) return true;
    const x = parseNumeric(a), y = parseNumeric(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    // SAT accepts decimals truncated/rounded to the 4-5 characters that fit in the grid.
    const tol = Math.max(tolerance || 0, 1e-9 * Math.max(1, Math.abs(y)));
    if (Math.abs(x - y) <= tol) return true;
    const typed = String(a).trim();
    if (!tolerance && /\.\d{3,}$/.test(typed) && !Number.isInteger(y)) {
      const decimals = typed.split('.')[1].length;
      const scale = 10 ** decimals;
      return Math.abs(x - Math.trunc(y * scale) / scale) < 1e-12 || Math.abs(x - Math.round(y * scale) / scale) < 1e-12;
    }
    return false;
  }

  function grade(q, answer) {
    if (answer === null || answer === undefined || String(answer).trim() === '') return false;
    if (q.type === 'mcq') return String(answer).trim().toUpperCase() === q.correct_answer;
    return [q.correct_answer, ...(q.accepted_answers || [])].some(x => numericEquals(answer, x, q.tolerance));
  }

  function displayAnswer(q) {
    if (q.type === 'mcq') return `${q.correct_answer}. ${q.choices[q.correct_answer]}`;
    const alts = (q.accepted_answers || []).filter(a => a !== q.correct_answer);
    return q.correct_answer + (alts.length ? `  (also accepted: ${alts.join(', ')})` : '');
  }

  /* Recursive-descent evaluator. Supports + - * / ^, parentheses, implicit multiplication,
     pi, e, x (or any provided variable), and sqrt abs sin cos tan ln log exp. */
  const FUNCS = { sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp };
  function compile(expression) {
    const src = String(expression).replace(/π/g, 'pi').replace(/×|·/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^').replace(/\s+/g, '').toLowerCase();
    const tokens = [];
    for (let i = 0; i < src.length;) {
      const rest = src.slice(i);
      let m;
      if ((m = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/))) { tokens.push({ t: 'n', v: Number(m[0]) }); i += m[0].length; }
      else if ((m = rest.match(/^(sqrt|abs|sin|cos|tan|ln|log|exp)(?=\()/))) { tokens.push({ t: 'f', v: m[1] }); i += m[1].length; }
      else if ((m = rest.match(/^(pi|e(?![a-z])|[a-z])/))) { tokens.push({ t: 'v', v: m[1] }); i += m[1].length; }
      else if ('+-*/^()'.includes(src[i])) { tokens.push({ t: src[i] }); i++; }
      else throw new Error('Unexpected “' + src[i] + '”');
    }
    // Insert implicit multiplication: 2x, 2(…), )(, x(, )x, 3pi
    const withMul = [];
    tokens.forEach((tk, k) => {
      const prev = withMul[withMul.length - 1];
      if (k && prev && (prev.t === 'n' || prev.t === 'v' || prev.t === ')') && (tk.t === 'n' || tk.t === 'v' || tk.t === 'f' || tk.t === '(')) withMul.push({ t: '*' });
      withMul.push(tk);
    });
    let i = 0;
    const peek = () => withMul[i] && withMul[i].t;
    function expr() { let node = term(); while (peek() === '+' || peek() === '-') { const op = withMul[i++].t; const r = term(); const l = node; node = op === '+' ? s => l(s) + r(s) : s => l(s) - r(s); } return node; }
    function term() { let node = unary(); while (peek() === '*' || peek() === '/') { const op = withMul[i++].t; const r = unary(); const l = node; node = op === '*' ? s => l(s) * r(s) : s => l(s) / r(s); } return node; }
    function unary() { if (peek() === '-') { i++; const u = unary(); return s => -u(s); } if (peek() === '+') { i++; return unary(); } return power(); }
    function power() { const base = atom(); if (peek() === '^') { i++; const ex = unary(); return s => Math.pow(base(s), ex(s)); } return base; }
    function atom() {
      const tk = withMul[i++];
      if (!tk) throw new Error('Incomplete expression');
      if (tk.t === 'n') return () => tk.v;
      if (tk.t === 'v') {
        if (tk.v === 'pi') return () => Math.PI;
        if (tk.v === 'e') return () => Math.E;
        return s => { if (!(tk.v in s)) throw new Error('Unknown variable ' + tk.v); return s[tk.v]; };
      }
      if (tk.t === 'f') { if (withMul[i++]?.t !== '(') throw new Error('Expected ('); const a = expr(); if (withMul[i++]?.t !== ')') throw new Error('Missing )'); const fn = FUNCS[tk.v]; return s => fn(a(s)); }
      if (tk.t === '(') { const a = expr(); if (withMul[i++]?.t !== ')') throw new Error('Missing )'); return a; }
      throw new Error('Unexpected ' + tk.t);
    }
    const fn = expr();
    if (i !== withMul.length) throw new Error('Invalid expression');
    return fn;
  }
  function evaluate(expression, scope = {}) {
    const v = compile(expression)(scope);
    if (!Number.isFinite(v)) throw new Error('Result is not a finite number');
    return v;
  }

  SPS.grading = { parseNumeric, isNumeric, numericEquals, grade, displayAnswer, compile, evaluate };
})(window.SPS = window.SPS || {});
