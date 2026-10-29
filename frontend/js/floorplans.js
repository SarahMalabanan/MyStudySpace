// One entry per floor, matched to the room_code in your database.
// Pixel positions are measured on the ORIGINAL image (width x height below).
//   Rectangle: [x, y, width, height]
//   Circle:    [centerX, centerY, radius]
// Any room not listed here still works: it shows as a button under the map.
const FLOORPLANS = {
  2: {
    image: 'images/floor2.jpg', width: 1446, height: 1154,
    spots: {
      '2C-1': [978, 632, 43],
      '2C-2': [1236, 656, 43],
      '2C-3': [1140, 275, 43],
      '2C-4': [1268, 444, 43],
    },
  },
  3: {
    image: 'images/floor3.jpg', width: 1330, height: 1208,
    spots: {
      '318': [583, 201, 84, 66],
      '319': [583, 127, 84, 74],
      '320': [583, 53, 84, 74],
      '321': [926, 208, 81, 78],
      '322': [926, 127, 81, 81],
      '323': [926, 53, 81, 74],
      '303': [330, 721, 80, 99],
      '304': [330, 590, 80, 131],
      '305': [410, 721, 79, 99],
      '306': [410, 590, 79, 131],
      '3C-1': [1032, 962, 63, 63],
      '3C-2': [1032, 1025, 63, 60],
      '3C-3': [1032, 1085, 63, 67],
      '3C-4': [459, 960, 63, 67],
      '3C-5': [522, 960, 58, 67],
      '3C-6': [522, 1087, 58, 65],
      '3C-7': [459, 1087, 63, 65],
      '3C-8': [397, 1087, 62, 65],
    },
  },
};