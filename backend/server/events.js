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

module.exports = {
  setSocketIO,
  emitRealtimeEvent,
};
