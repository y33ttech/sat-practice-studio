/* Digital SAT content taxonomy: Section → Domain → Skill.
   Generated banks attach their patterns to a skill; the library tree is built from this. */
(function (SPS) {
  'use strict';
  const T = {
    sections: [
      {
        id: 'math', name: 'Math', domains: [
          { id: 'algebra', name: 'Algebra', skills: [
            'Linear equations in one variable',
            'Linear functions',
            'Linear equations in two variables',
            'Systems of two linear equations in two variables',
            'Linear inequalities in one or two variables'] },
          { id: 'advanced-math', name: 'Advanced Math', skills: [
            'Equivalent expressions',
            'Nonlinear equations in one variable and systems of equations in two variables',
            'Nonlinear functions'] },
          { id: 'psda', name: 'Problem-Solving and Data Analysis', skills: [
            'Ratios, rates, proportional relationships, and units',
            'Percentages',
            'One-variable data: Distributions and measures of center and spread',
            'Two-variable data: Models and scatterplots',
            'Probability and conditional probability',
            'Inference from sample statistics and margin of error',
            'Evaluating statistical claims: Observational studies and experiments'] },
          { id: 'geometry', name: 'Geometry and Trigonometry', skills: [
            'Area and volume',
            'Lines, angles, and triangles',
            'Right triangles and trigonometry',
            'Circles'] }
        ]
      },
      {
        id: 'rw', name: 'Reading and Writing', domains: [
          { id: 'information-ideas', name: 'Information and Ideas', skills: [
            'Central Ideas and Details', 'Command of Evidence', 'Inferences'] },
          { id: 'craft-structure', name: 'Craft and Structure', skills: [
            'Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'] },
          { id: 'expression-ideas', name: 'Expression of Ideas', skills: [
            'Rhetorical Synthesis', 'Transitions'] },
          { id: 'conventions', name: 'Standard English Conventions', skills: [
            'Boundaries', 'Form, Structure, and Sense'] }
        ]
      }
    ]
  };

  const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[_:,.\-–—/()]+/g, ' ').replace(/\s+/g, ' ').trim();
  const slug = s => norm(s).replace(/ /g, '-').slice(0, 64) || 'custom';

  // Flattened lookup: normalized skill name → {section, domain, skill}
  const skillIndex = new Map();
  const domainIndex = new Map();
  for (const sec of T.sections) {
    for (const dom of sec.domains) {
      domainIndex.set(norm(dom.name), { section: sec, domain: dom });
      domainIndex.set(dom.id, { section: sec, domain: dom });
      dom.skillIds = dom.skills.map(slug);
      for (const sk of dom.skills) skillIndex.set(norm(sk), { section: sec, domain: dom, skill: sk, skillId: slug(sk) });
    }
  }
  // Common aliases LLMs or users produce
  const aliases = {
    'area and volume': 'Area and volume', 'area volume': 'Area and volume',
    'percentage': 'Percentages', 'percents': 'Percentages',
    'probability': 'Probability and conditional probability',
    'circle': 'Circles', 'trigonometry': 'Right triangles and trigonometry',
    'right triangles': 'Right triangles and trigonometry',
    'systems of linear equations': 'Systems of two linear equations in two variables',
    'linear inequalities': 'Linear inequalities in one or two variables',
    'one variable data': 'One-variable data: Distributions and measures of center and spread',
    'two variable data': 'Two-variable data: Models and scatterplots',
    'scatterplots': 'Two-variable data: Models and scatterplots',
    'ratios rates proportional relationships and units': 'Ratios, rates, proportional relationships, and units',
    'nonlinear equations': 'Nonlinear equations in one variable and systems of equations in two variables',
    'vocabulary': 'Words in Context', 'transitions': 'Transitions', 'punctuation': 'Boundaries',
    'grammar': 'Form, Structure, and Sense', 'cross text connections': 'Cross-Text Connections'
  };

  /** Resolve free-form skill/topic/domain text to a taxonomy location. */
  function locate({ section, domain, skill, topic, subject } = {}) {
    for (const candidate of [skill, topic]) {
      const key = norm(candidate);
      if (!key) continue;
      if (skillIndex.has(key)) return skillIndex.get(key);
      if (aliases[key]) return skillIndex.get(norm(aliases[key]));
      // Prefix/containment match for slightly shortened names
      for (const [k, v] of skillIndex) if (key.length > 6 && (k.startsWith(key) || key.startsWith(k))) return v;
    }
    const secGuess = guessSection(section || subject || '');
    const d = domainIndex.get(norm(domain)) || domainIndex.get(slug(domain));
    const label = String(skill || topic || 'General').trim() || 'General';
    if (d) return { section: d.section, domain: d.domain, skill: label, skillId: slug(label), custom: true };
    const sec = T.sections.find(s => s.id === secGuess) || null;
    return {
      section: sec || { id: 'other', name: 'Other subjects' },
      domain: { id: 'custom', name: domain ? String(domain) : 'Custom topics' },
      skill: label, skillId: slug(label), custom: true
    };
  }
  function guessSection(text) {
    const t = norm(text);
    if (!t) return '';
    if (t === 'rw' || /reading|writing|english|verbal|r&w/.test(t)) return 'rw';
    if (t === 'math' || /math/.test(t)) return 'math';
    return '';
  }

  SPS.taxonomy = { ...T, locate, slug, norm, guessSection };
})(window.SPS = window.SPS || {});
