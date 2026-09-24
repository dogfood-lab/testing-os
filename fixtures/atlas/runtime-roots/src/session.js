import { writeFile } from 'node:fs/promises';

export async function saveSession(input) {
  const { savePath } = input;
  await writeFile(savePath, '{}\n');
}
