let ioInstance = null;

function setSocketIO(io) {
  ioInstance = io;
}

function emitRealtimeEvent(event, payload) {
  if (ioInstance) {
    ioInstance.emit(event, { ...payload, timestamp: new Date().toISOString() });
    ioInstance.emit('dashboard:updated', { eventTriggered: event, timestamp: new Date().toISOString() });
  }
}

function emitUserRealtimeEvent(event, payload, userIds) {
  if (!ioInstance) return;
  const recipients = Array.isArray(userIds) ? userIds : [userIds];
  for (const userId of recipients) {
    if (userId === undefined || userId === null || userId === '') continue;
    ioInstance.to(`user:${String(userId).trim().toLowerCase()}`).emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = {
  setSocketIO,
  emitRealtimeEvent,
  emitUserRealtimeEvent,
};
