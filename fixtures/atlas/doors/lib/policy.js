export function loadPolicy() {
  return { allow: true };
}

export function checkPolicy(text) {
  return text.length > 0;
}
