export function normalizeM3UInput(content: string) {
  return String(content ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => {
      const trimmedStart = line.trimStart();
      const indentation = line.slice(0, line.length - trimmedStart.length);

      if (/^#extm3u\b/i.test(trimmedStart)) {
        return indentation + trimmedStart.replace(/^#extm3u\b/i, '#EXTM3U');
      }

      if (/^#extinf\s*:/i.test(trimmedStart)) {
        return indentation + trimmedStart.replace(/^#extinf\s*:/i, '#EXTINF:');
      }

      return line;
    })
    .join('\n');
}
