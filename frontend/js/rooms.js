
/**
 * MyStudySpace - Study Room Search and Availability
 *
 * Sprint 1 - View Available Study Rooms
 *
 * Description:
 * Displays study rooms, floor plans, availability,
 * search filters, and room details.
 *
 * Responsibilities:
 * 1. Initialize search filters.
 * 2. Retrieve rooms from the backend API.
 * 3. Display interactive floor plans.
 * 4. Filter rooms by availability and accessories.
 * 5. Allow students to select available rooms.
 * 6. Navigate to the reservation page.
 * 7. Handle API failures without breaking the interface.
 *
 * Important:
 * - Room data is retrieved through getRooms().
 * - Database credentials are never exposed to the browser.
 * - Room availability must ultimately be verified
 *   by the backend before a reservation is created.
 */

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

const pickMode = new URLSearchParams(
  window.location.search
).has("pick");

let rooms = [];
let applied = {};

const state = {
  floor: 2,
  selected: null
};

/**
 * Reads the current search filter values.
 *
 * @returns {Object} Selected search filters.
 */
function readFilters() {
  return {
    date: $("date").value,
    hour: Number($("time").value),
    floor: Number($("floor").value),
    whiteboard: $("f-whiteboard").checked,
    window: $("f-window").checked,
    outlet: $("f-outlet").checked
  };
}

/**
 * Checks whether a room satisfies the current filters.
 *
 * @param {Object} room - Room information.
 * @returns {boolean} Whether the room is available.
 */
function isAvailable(room) {
  const booked = isRangeBooked(
    room.id,
    applied.date,
    applied.hour,
    applied.hour + 1
  );

  return (
    !booked &&
    (!applied.whiteboard || room.whiteboard) &&
    (!applied.window || room.window) &&
    (!applied.outlet || room.outlet)
  );
}

/**
 * Renders the floor selection tabs.
 */
function renderTabs() {
  const tabs = $("tabs");

  tabs.innerHTML = Object.entries(FLOOR_NAMES)
    .map(([number, name]) => `
      <button
        type="button"
        data-floor="${number}"
        class="${Number(number) === state.floor ? "active" : ""}"
      >
        ${name}
      </button>
    `)
    .join("");

  tabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.floor = Number(button.dataset.floor);
      $("floor").value = String(state.floor);
      state.selected = null;
      render();
    });
  });
}

/**
 * Selects an available room.
 *
 * @param {Object} room - Selected room.
 */
function choose(room) {
  state.selected = room.id;
  render();
}

/**
 * Renders room locations on the floor plan.
 */
function renderMap() {
  const map = $("map");
  map.innerHTML = "";

  const plan = FLOORPLANS[state.floor];

  const floorRooms = rooms.filter(
    (room) => room.floor === state.floor
  );

  const spotFor = (room) =>
    plan && plan.spots[room.room_code];

  if (plan) {
    const wrapper = document.createElement("div");
    wrapper.className = "plan";

    const image = document.createElement("img");
    image.src = plan.image;
    image.alt = `${FLOOR_NAMES[state.floor]} floor plan`;

    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute(
      "viewBox",
      `0 0 ${plan.width} ${plan.height}`
    );

    floorRooms.filter(spotFor).forEach((room) => {
      const spot = spotFor(room);
      const available = isAvailable(room);

      const isCircle = spot.length === 3;

      const shape = document.createElementNS(
        SVG_NS,
        isCircle ? "circle" : "rect"
      );

      if (isCircle) {
        shape.setAttribute("cx", spot[0]);
        shape.setAttribute("cy", spot[1]);
        shape.setAttribute("r", spot[2]);
      } else {
        shape.setAttribute("x", spot[0]);
        shape.setAttribute("y", spot[1]);
        shape.setAttribute("width", spot[2]);
        shape.setAttribute("height", spot[3]);
      }

      shape.setAttribute(
        "class",
        "spot " +
        (
          state.selected === room.id
            ? "selected"
            : available
              ? "available"
              : "unavailable"
        )
      );

      shape.setAttribute("role", "button");

      shape.setAttribute(
        "aria-label",
        `${room.name}, ${
          available ? "available" : "unavailable"
        }`
      );

      const tooltip = document.createElementNS(
        SVG_NS,
        "title"
      );

      tooltip.textContent =
        `${room.name} · ${room.seats} seats` +
        (available ? "" : " · unavailable");

      shape.appendChild(tooltip);

      if (available) {
        shape.setAttribute("tabindex", "0");

        shape.addEventListener("click", () => {
          choose(room);
        });

        shape.addEventListener("keydown", (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            choose(room);
          }
        });
      }

      svg.appendChild(shape);
    });

    if (pickMode) {
      enablePicker(svg, plan);
    }

    wrapper.append(image, svg);
    map.appendChild(wrapper);
  }

  // Display rooms without mapped floor-plan coordinates.
  const otherRooms = floorRooms.filter(
    (room) => !spotFor(room)
  );

  if (otherRooms.length > 0) {
    const container = document.createElement("div");
    container.className = "others";

    container.innerHTML =
      '<h3>Other spaces on this floor</h3>' +
      '<div class="list"></div>';

    const list = container.querySelector(".list");

    otherRooms.forEach((room) => {
      const available = isAvailable(room);

      const button = document.createElement("button");
      button.type = "button";

      button.className =
        "tile" +
        (available ? "" : " unavailable") +
        (state.selected === room.id ? " selected" : "");

      button.textContent = room.room_code;
      button.disabled = !available;

      button.setAttribute(
        "aria-label",
        `${room.name}, ${
          available ? "available" : "unavailable"
        }`
      );

      button.addEventListener("click", () => {
        choose(room);
      });

      list.appendChild(button);
    });

    map.appendChild(container);
  }
}

/**
 * Enables floor-plan coordinate selection.
 *
 * Development utility:
 * Add ?pick to the URL to select room coordinates.
 *
 * @param {SVGElement} svg - Floor plan overlay.
 * @param {Object} plan - Floor plan configuration.
 */
function enablePicker(svg, plan) {
  let first = null;
  let output = $("pick-out");

  if (!output) {
    output = document.createElement("div");
    output.id = "pick-out";
    $("map").after(output);
  }

  output.textContent =
    "Pick mode: click the top-left corner of a room, " +
    "then the bottom-right.";

  svg.style.cursor = "crosshair";

  svg.addEventListener("click", (event) => {
    const bounds = svg.getBoundingClientRect();

    const x = Math.round(
      ((event.clientX - bounds.left) / bounds.width) *
      plan.width
    );

    const y = Math.round(
      ((event.clientY - bounds.top) / bounds.height) *
      plan.height
    );

    if (!first) {
      first = { x, y };

      output.textContent =
        `First corner: ${x}, ${y}. ` +
        "Now click the opposite corner.";

      return;
    }

    output.textContent = JSON.stringify([
      Math.min(first.x, x),
      Math.min(first.y, y),
      Math.abs(x - first.x),
      Math.abs(y - first.y)
    ]);

    first = null;
  });
}

/**
 * Builds a room accessory list item.
 *
 * @param {string} label - Accessory name.
 * @param {boolean} available - Accessory availability.
 * @returns {string} HTML list item.
 */
function feature(label, available) {
  return `<li class="${available ? "" : "no"}">${label}</li>`;
}

/**
 * Displays details for the selected room.
 */
function renderDetail() {
  const details = $("detail");

  const room = rooms.find(
    (item) => item.id === state.selected
  );

  if (!room) {
    details.innerHTML =
      '<h2>Room details</h2>' +
      '<p class="empty">' +
      'Click an available room on the map ' +
      'to see its details.' +
      '</p>';

    return;
  }

  details.innerHTML = `
    <h2>${room.name}</h2>
    ${roomPhotoHtml(room)}
    <div>Seats ${room.seats}</div>

    <ul class="features">
      ${feature("Whiteboard", room.whiteboard)}
      ${feature("Window", room.window)}
      ${feature("Outlet", room.outlet)}
    </ul>

    <div>
      ${applied.date} · ${fmtHour(applied.hour)}
    </div>

    <div class="status">Available</div>

    <button
      type="button"
      class="btn"
      id="select-room"
    >
      Select room
    </button>
  `;

  $("select-room").addEventListener("click", () => {
    const query = new URLSearchParams({
      room: String(room.id),
      date: applied.date,
      start: String(applied.hour)
    });

    window.location.href =
      `reserve.html?${query.toString()}`;
  });
}

/**
 * Refreshes the room search interface.
 */
function render() {
  renderTabs();
  renderMap();
  renderDetail();
}

/**
 * Initializes the room search page.
 *
 * IMPORTANT FIX:
 * Search filters are initialized BEFORE loading rooms.
 *
 * This prevents a failed API request from leaving
 * the Time dropdown empty.
 */
async function init() {
  // STEP 1: Initialize the search filters.
  $("date").value = today();

  $("time").innerHTML = hourOptions(8, 20, true);
  $("time").value = "13";

  applied = readFilters();
  state.floor = applied.floor;

  // STEP 2: Register the Search Rooms button.
  $("search").addEventListener("click", () => {
    applied = readFilters();
    state.floor = applied.floor;
    state.selected = null;
    render();
  });

  // STEP 3: Load rooms from the existing API helper.
  try {
    rooms = await getRooms();

    if (!Array.isArray(rooms)) {
      throw new Error("Invalid room data received.");
    }

  } catch (error) {
    console.error(
      "MyStudySpace: Failed to load rooms:",
      error
    );

    $("map").textContent =
      "Could not load rooms. Is the server running?";

    $("detail").innerHTML =
      '<h2>Room details</h2>' +
      '<p class="empty">' +
      'Room information is temporarily unavailable.' +
      '</p>';

    return;
  }

  // STEP 4: Render rooms after successful loading.
  render();
}

// Initialize the page when the HTML is ready.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
