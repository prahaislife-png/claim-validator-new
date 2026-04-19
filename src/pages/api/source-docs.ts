import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const referenceDir = path.join(process.cwd(), 'reference_docs');
  const docs: { name: string; content: string }[] = [];

  try {
    const files = fs.readdirSync(referenceDir);
    for (const file of files) {
      if (file.endsWith('.txt')) {
        const content = fs.readFileSync(path.join(referenceDir, file), 'utf-8');
        docs.push({ name: file, content });
      }
    }
  } catch {
    // reference_docs may not exist in all environments
  }

  res.status(200).json({ docs });
}
