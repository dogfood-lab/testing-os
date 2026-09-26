/**
 * The simple commands of a step's shell text, each word with the span of
 * text it was read from, so a flag can be added at the end of one command
 * and nowhere else. Quotes, escapes, line continuations, comments,
 * redirections and heredoc bodies are read as bash reads them; the commands
 * a substitution runs are commands too, marked nested.
 *
 * @param {string} text
 * @returns {Array<{ words: Array<{ text: string, start: number, end: number }>, nested: boolean }>}
 */
export function simpleCommands(text) {
  const out = [];
  scan(text, 0, text.length, false, out);
  return out;
}

// A redirection operator with nothing attached, whose target is the next word.
const BARE_REDIRECT = /^[0-9]*(>>?|>\||<>?|&>>?|>&|<&|<<<)$/;

function scan(text, from, to, nested, out) {
  let words = [];
  let word = null;
  // The next word is a redirection's target, or a heredoc's delimiter.
  let target = null;
  let heredocs = [];
  const flush = () => {
    if (word == null) return;
    if (word.redirect) {
      if (word.heredoc) target = { heredoc: word.heredoc };
      else if (BARE_REDIRECT.test(word.text)) target = {};
    } else if (target != null) {
      if (target.heredoc) heredocs.push({ delimiter: word.text, strip: target.heredoc === '<<-' });
      target = null;
    } else words.push({ text: word.text, start: word.start, end: word.end });
    word = null;
  };
  const end = () => {
    flush();
    target = null;
    if (words.length > 0) out.push({ words, nested });
    words = [];
  };
  const extend = (at, chunk, next) => {
    if (word == null) word = { text: '', start: at, end: at };
    word.text += chunk;
    word.end = next;
  };
  let i = from;
  while (i < to) {
    const ch = text[i];
    if (ch === '\\') {
      if (text[i + 1] === '\n') {
        i += 2;
        continue;
      }
      if (text[i + 1] === '\r' && text[i + 2] === '\n') {
        i += 3;
        continue;
      }
      extend(i, text[i + 1] ?? '', Math.min(i + 2, to));
      i += 2;
      continue;
    }
    if (ch === "'") {
      const close = text.indexOf("'", i + 1);
      const stop = close === -1 || close >= to ? to : close;
      extend(i, text.slice(i + 1, stop), Math.min(stop + 1, to));
      i = stop + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let inner = '';
      while (j < to && text[j] !== '"') {
        if (text[j] === '\\' && '"\\$`\n'.includes(text[j + 1] ?? '')) {
          if (text[j + 1] !== '\n') inner += text[j + 1];
          j += 2;
          continue;
        }
        if (text[j] === '$' && text[j + 1] === '(') {
          const close = closing(text, j + 1, to);
          if (text[j + 2] !== '(') scan(text, j + 2, close, true, out);
          inner += text.slice(j, close + 1);
          j = close + 1;
          continue;
        }
        if (text[j] === '`') {
          const close = backtick(text, j, to);
          scan(text, j + 1, close, true, out);
          inner += text.slice(j, close + 1);
          j = close + 1;
          continue;
        }
        inner += text[j];
        j += 1;
      }
      extend(i, inner, Math.min(j + 1, to));
      i = j + 1;
      continue;
    }
    if (ch === '$' && text[i + 1] === '(') {
      const close = closing(text, i + 1, to);
      if (text[i + 2] !== '(') scan(text, i + 2, close, true, out);
      extend(i, text.slice(i, close + 1), Math.min(close + 1, to));
      i = close + 1;
      continue;
    }
    if (ch === '$' && text[i + 1] === '{') {
      const close = brace(text, i + 1, to);
      extend(i, text.slice(i, close + 1), Math.min(close + 1, to));
      i = close + 1;
      continue;
    }
    if (ch === '`') {
      const close = backtick(text, i, to);
      scan(text, i + 1, close, true, out);
      extend(i, text.slice(i, close + 1), Math.min(close + 1, to));
      i = close + 1;
      continue;
    }
    if (ch === '#' && word == null) {
      const close = text.indexOf('\n', i);
      i = close === -1 || close >= to ? to : close;
      continue;
    }
    if (ch === '\n') {
      end();
      i += 1;
      for (const doc of heredocs) i = pastHeredoc(text, i, to, doc);
      heredocs = [];
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      flush();
      i += 1;
      continue;
    }
    if (ch === '<' || ch === '>' || (ch === '&' && text[i + 1] === '>')) {
      // A word of digits right before the operator is its file descriptor.
      const fd = word != null && !word.redirect && /^[0-9]+$/.test(word.text) && word.end === i ? word : null;
      if (fd == null) flush();
      const match = /^(<<<|<<-|<<|&>>|&>|>>|>\||>&|<&|<>|>|<)/.exec(text.slice(i, to))[1];
      let token = (fd ? fd.text : '') + match;
      let j = i + match.length;
      if ((match === '>&' || match === '<&') && /[0-9-]/.test(text[j] ?? '')) {
        while (j < to && /[0-9-]/.test(text[j])) token += text[j++];
      }
      word = { text: token, start: fd ? fd.start : i, end: j, redirect: true, heredoc: match === '<<' || match === '<<-' ? match : null };
      i = j;
      // A heredoc's delimiter or a redirection's target written right after
      // the operator is read as the next word.
      if (!/[\s;&|()]/.test(text[i] ?? ' ')) flush();
      continue;
    }
    if (ch === ';' || ch === '|' || ch === '&' || ch === '(' || ch === ')') {
      end();
      i += ch === '|' || ch === '&' ? (text[i + 1] === ch || (ch === '|' && text[i + 1] === '&') ? 2 : 1) : 1;
      continue;
    }
    extend(i, ch, i + 1);
    i += 1;
  }
  end();
}

// Past a heredoc's body: the lines up to and including its delimiter.
function pastHeredoc(text, at, to, { delimiter, strip }) {
  let i = at;
  while (i < to) {
    const close = text.indexOf('\n', i);
    const stop = close === -1 || close >= to ? to : close;
    let line = text.slice(i, stop).replace(/\r$/, '');
    if (strip) line = line.replace(/^\t+/, '');
    i = stop + 1;
    if (line === delimiter) break;
  }
  return Math.min(i, to);
}

// The index of the parenthesis that closes the one at `open`; `to` when none does.
function closing(text, open, to) {
  let depth = 0;
  for (let i = open; i < to; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === "'") {
      const close = text.indexOf("'", i + 1);
      if (close === -1 || close >= to) return to;
      i = close;
      continue;
    }
    if (ch === '"') {
      for (i += 1; i < to && text[i] !== '"'; i += 1) if (text[i] === '\\') i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return to;
}

function brace(text, open, to) {
  let depth = 0;
  for (let i = open; i < to; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return to;
}

function backtick(text, open, to) {
  for (let i = open + 1; i < to; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === '`') return i;
  }
  return to;
}
