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
const MOCK_ROOMS1 = [
  {id: 21, name: "Pod C-1", floor: 2, seats: 4, whiteboard: true, window: false, outlet: true},
  {id: 22, name: "Pod C-2", floor: 2, seats: 4, whiteboard: true, window: false, outlet: true},
  {id: 23, name: "Pod C-3", floor: 2, seats: 4, whiteboard: true, window: false, outlet: false},
  {id: 24, name: "Pod C-4", floor: 2, seats: 4, whiteboard: true, window: false, outlet: false},
  {id: 303, name: "Room 303", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 304, name: "Room 304", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 305, name: "Room 305", floor: 3, seats: 4, whiteboard: true, window: false, outlet: true},
  {id: 306, name: "Room 306", floor: 3, seats: 4, whiteboard: true, window: false, outlet: true},
  {id: 318, name: "Room 318", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 319, name: "Room 319", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 320, name: "Room 320", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 321, name: "Room 321", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 322, name: "Room 322", floor: 3, seats: 2, whiteboard: true, window: false, outlet: true},
  {id: 323, name: "Room 323", floor: 3, seats: 1, whiteboard: false, window: true, outlet: true},
  {id: 31, name: "Cube C-1", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 32, name: "Cube C-2", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 33, name: "Cube C-3", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 34, name: "Cube C-4", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 35, name: "Cube C-5", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 36, name: "Cube C-6", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 37, name: "Cube C-7", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
  {id: 38, name: "Cube C-8", floor: 3, seats: 2, whiteboard: false, window: false, outlet: true},
];