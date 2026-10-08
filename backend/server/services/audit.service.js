const memoryAuditLogs = [];


async function recordAuditLog(dbPool, params) {
  const logId = `audit_${Math.random().toString(36).substring(2, 11)}`;
  const now = new Date().toISOString();

  const auditItem = {
    id: logId,
    actorId: params.actorId || null,
    actorEmail: params.actorEmail || 'system@markops.io',
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    previousState: params.previousState ? JSON.stringify(params.previousState) : null,
    newState: params.newState ? JSON.stringify(params.newState) : null,
    ipAddress: params.ipAddress || '127.0.0.1',
    userAgent: params.userAgent || 'MarkOps API',
    createdAt: now,
  };

  memoryAuditLogs.unshift(auditItem);

  if (dbPool) {
    try {
      const numericActorId = typeof params.actorId === 'number' ? params.actorId : (parseInt(params.actorId, 10) || null);
      await dbPool.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, previous_state, new_state, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          numericActorId,
          params.action,
          params.entityType,
          String(params.entityId || ''),
          params.previousState ? JSON.stringify(params.previousState) : null,
          params.newState ? JSON.stringify(params.newState) : null,
          params.ipAddress || '127.0.0.1',
          params.userAgent || 'MarkOps API',
        ]
      );
      console.log(`[Audit Service] Recorded audit event: ${params.action} on ${params.entityType}:${params.entityId}`);
    } catch (err) {
      console.log('[Audit Service Notice] MySQL insert notice (used memory store):', err?.message || err);
    }
  }

  return auditItem;
}


async function getAuditLogs(dbPool) {
  const combined = [];
  const seen = new Set();

  if (dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT a.id, a.actor_id as actorId, u.email as actorEmail, u.full_name as actorName, a.action, a.entity_type as entityType, a.entity_id as entityId,
               a.previous_state as previousState, a.new_state as newState, a.ip_address as ipAddress, a.user_agent as userAgent, a.created_at as createdAt
        FROM audit_logs a
        LEFT JOIN users u ON a.actor_id = u.id
        ORDER BY a.created_at DESC
        LIMIT 200
      `);
      if (Array.isArray(rows) && rows.length > 0) {
        rows.forEach((r) => {
          const key = `${r.action}_${r.entityType}_${r.entityId}_${r.createdAt}`;
          seen.add(key);
          combined.push({
            id: r.id,
            actorId: r.actorId,
            actorEmail: r.actorEmail || 'admin@markops.io',
            actorName: r.actorName || 'User',
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            previousState: r.previousState,
            newState: r.newState,
            ipAddress: r.ipAddress || '127.0.0.1',
            userAgent: r.userAgent || 'MarkOps API',
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          });
        });
      }
    } catch (e) {
      console.log('MySQL audit query notice (using fallback memory store):', e?.message || e);
    }
  }

  for (const m of memoryAuditLogs) {
    const key = `${m.action}_${m.entityType}_${m.entityId}_${m.createdAt}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(m);
    }
  }

  combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return combined;
}

module.exports = {
  recordAuditLog,
  getAuditLogs,
};
