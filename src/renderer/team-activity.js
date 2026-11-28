const EVENTS = Object.freeze({
  'session.execution.started': 'Çalışma başladı',
  'session.execution.succeeded': 'Çalışma tamamlandı',
  'session.execution.failed': 'Çalışma başarısız',
  'session.execution.interrupted': 'Çalışma durduruldu',
  'session.tool.called': 'Araç çağrıldı',
  'session.tool.success': 'Araç tamamlandı',
  'session.tool.failed': 'Araç hatası',
  'permission.asked': 'Onay istendi',
  'permission.replied': 'Onay yanıtlandı',
  'board.changed': 'Görev panosu güncellendi'
});

export function addTeamActivity(rows, event) {
  if (!Object.hasOwn(EVENTS, event?.type)) return rows;
  const id = typeof event.data?.sessionID === 'string' ? event.data.sessionID : '';
  const at = Date.parse(event.at);
  return [{
    label: EVENTS[event.type],
    sessionId: id,
    at: Number.isFinite(at) ? at : Date.now()
  }, ...rows].slice(0, 60);
}

export function teamTasks(rows, code) {
  if (!code) return [];
  return rows.filter((item) =>
    String(item.owner || '').trim().toUpperCase() === code.toUpperCase() &&
    (item.status === 'devam' || item.status === 'bloke')
  );
}
