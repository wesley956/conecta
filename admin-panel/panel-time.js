(() => {
  'use strict';
  if (window.RonecaPanelTime) return;

  const TIME_ZONE = 'America/Sao_Paulo';
  const locale = 'pt-BR';

  function dateParts(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const result = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      year: Number(result.year), month: Number(result.month), day: Number(result.day),
      hour: Number(result.hour), minute: Number(result.minute), second: Number(result.second),
    };
  }

  function isoDate(value = new Date()) {
    const parts = dateParts(value);
    if (!parts) return '';
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function zonedDateTimeToIso(dateText, hour = 23, minute = 59, second = 59, millisecond = 999) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || '').trim());
    if (!match) throw new Error('Data inválida.');
    const desired = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour, minute, second };
    const desiredNaive = Date.UTC(desired.year, desired.month - 1, desired.day, hour, minute, second, millisecond);
    let candidate = desiredNaive;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const actual = dateParts(new Date(candidate));
      if (!actual) throw new Error('Data inválida.');
      const actualNaive = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, millisecond);
      const delta = desiredNaive - actualNaive;
      candidate += delta;
      if (delta === 0) break;
    }
    const result = new Date(candidate);
    if (Number.isNaN(result.getTime())) throw new Error('Data inválida.');
    return result.toISOString();
  }

  function addDaysToLocalDate(dateText, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || '').trim());
    if (!match) throw new Error('Data inválida.');
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + Math.max(0, Number(days || 0)));
    return date.toISOString().slice(0, 10);
  }

  function endOfDayIso(dateText) { return zonedDateTimeToIso(dateText, 23, 59, 59, 999); }

  function projectedExpiry({ currentExpiry = null, durationDays = 30, customDate = '', renewal = false } = {}) {
    if (customDate) return endOfDayIso(customDate);
    const now = new Date();
    const current = currentExpiry ? new Date(currentExpiry) : null;
    const baseline = renewal && current && !Number.isNaN(current.getTime()) && current > now ? current : now;
    const baseDate = isoDate(baseline);
    return endOfDayIso(addDaysToLocalDate(baseDate, Math.max(1, Number(durationDays || 30))));
  }

  function formatDateTime(value, { includeZone = true } = {}) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const formatted = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'medium' }).format(date);
    return includeZone ? `${formatted} · Brasília (${TIME_ZONE})` : formatted;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, dateStyle: 'short' }).format(date);
  }

  function minutesSince(value) {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 60000)) : null;
  }

  const api = Object.freeze({ TIME_ZONE, isoDate, endOfDayIso, projectedExpiry, formatDateTime, formatDate, minutesSince });
  window.RonecaPanelTime = api;

  let attempts = 0;
  const bridge = setInterval(() => {
    attempts += 1;
    if (typeof window.fmtDate === 'function' && !window.fmtDate.__ronecaSaoPaulo) {
      const replacement = value => formatDateTime(value, { includeZone: false });
      replacement.__ronecaSaoPaulo = true;
      window.fmtDate = replacement;
    }
    if (attempts >= 30) clearInterval(bridge);
  }, 100);
})();
