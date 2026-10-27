// Makes sure secrets (e.g. the user's MongoDB connection string) can never
// show up in deploy logs or error messages, even if a platform API echoes
// them back in an error response.
exports.makeRedactor = (secrets = []) => {
  const list = [];
  for (const s of secrets) {
    if (!s || typeof s !== 'string' || s.length < 4) continue;
    list.push(s);
    // also hide just the password part of a connection string
    const m = s.match(/^[a-z+]+:\/\/[^:@/]+:([^@]+)@/i);
    if (m && m[1].length >= 4) {
      list.push(m[1]);
      try { list.push(decodeURIComponent(m[1])); } catch (_) { /* not url-encoded */ }
    }
  }
  const uniq = [...new Set(list)].sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text ?? '');
    for (const s of uniq) out = out.split(s).join('***');
    return out;
  };
};
