// Swap these for fetch('/api/...') once the backend exists.
async function getRooms() { return MOCK_ROOMS; }
async function getRoom(id) { return MOCK_ROOMS.find((r) => r.id === Number(id)); }