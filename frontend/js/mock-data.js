// Fake data. Same shape the real API will return later.
function makeFloor(floor, start) {
  return Array.from({ length: 8 }, (_, i) => ({
    id: start + i,
    name: `Room ${start + i}`,
    floor,
    seats: [1, 4, 6, 8][i % 4],
    whiteboard: i % 3 !== 1,
    window: i % 2 === 1,
    outlet: i !== 5,
    booked: i % 2 === 0 ? [10, 13] : [9, 14, 15], // start hours already taken
    row: i < 4 ? 1 : 3,
    col: (i % 4) + 1,
  }));
}
const MOCK_ROOMS = [...makeFloor(2, 201), ...makeFloor(3, 309)];