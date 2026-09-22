function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function pairKey(left, right) {
  return left < right ? `${left}\0${right}` : `${right}\0${left}`;
}

export function divergenceHits({ boundaries, pairs, marks, floor, strengthFloor = 0.5, drop = 0.2 }) {
  const place = new Map();
  for (const boundary of boundaries) {
    for (const path of boundary.files) place.set(path, boundary.name);
  }
  const inside = new Map();
  const outside = new Map();
  const between = new Map();
  for (const boundary of boundaries) {
    inside.set(boundary.name, 0);
    outside.set(boundary.name, 0);
  }
  for (const pair of pairs) {
    const left = place.get(pair.a);
    const right = place.get(pair.b);
    if (!left || !right) continue;
    if (left === right) inside.set(left, inside.get(left) + pair.strength);
    else {
      outside.set(left, (outside.get(left) ?? 0) + pair.strength);
      outside.set(right, (outside.get(right) ?? 0) + pair.strength);
      const key = pairKey(left, right);
      between.set(key, (between.get(key) ?? 0) + pair.strength);
    }
  }
  const confidence = floor === 'fallen' ? 'low' : 'full';
  const hits = [];
  for (const boundary of boundaries) {
    const inn = inside.get(boundary.name) ?? 0;
    const out = outside.get(boundary.name) ?? 0;
    if (inn + out > 0 && out > inn) {
      hits.push({
        rule: 'leaks',
        boundary: boundary.name,
        value: round(out),
        threshold: round(inn),
        confidence,
      });
    }
  }
  for (const [key, strength] of between) {
    const [left, right] = key.split('\0');
    const smaller = Math.min(inside.get(left) ?? 0, inside.get(right) ?? 0);
    if (strength > smaller) {
      hits.push({
        rule: 'two-may-be-one',
        boundaries: left < right ? [left, right] : [right, left],
        value: round(strength),
        threshold: round(smaller),
        confidence,
      });
    }
  }
  const best = new Map();
  for (const pair of pairs) {
    remember(best, pair.a, pair.b, pair.strength);
    remember(best, pair.b, pair.a, pair.strength);
  }
  for (const [file, partner] of best) {
    const home = place.get(file);
    const away = place.get(partner.partner);
    if (!home || !away || home === away) continue;
    hits.push({
      rule: 'file-moved',
      file,
      boundary: home,
      partner_boundary: away,
      value: round(partner.strength),
      threshold: strengthFloor,
      confidence,
    });
  }
  if (floor !== 'fallen') {
    for (const mark of marks ?? []) {
      if (mark.highWater == null || mark.cohesion == null) continue;
      const size = round(mark.highWater - mark.cohesion);
      if (size < drop) continue;
      hits.push({
        rule: 'cohesion-dropped',
        boundary: mark.name,
        value: size,
        threshold: drop,
        high_water_mark: mark.highWater,
        current: mark.cohesion,
        confidence,
      });
    }
  }
  return hits;
}

function remember(best, file, partner, strength) {
  const current = best.get(file);
  if (!current || strength > current.strength || (strength === current.strength && partner < current.partner)) {
    best.set(file, { partner, strength });
  }
}
